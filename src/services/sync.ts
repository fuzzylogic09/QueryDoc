import { db } from '../db/database';
import { listFiles, downloadFile, type DriveFile } from './google-drive';
import { extractText } from './extractor';
import { chunkText } from './chunker';
import { computeAndStoreEmbeddings } from './embeddings';
import type { DocumentIndex, Chunk, SyncProgress, AppSettings } from '../types';

function generateChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return hash.toString(36);
}

export async function synchronize(
  settings: AppSettings,
  onProgress: (p: SyncProgress) => void
): Promise<void> {
  const progress: SyncProgress = {
    phase: 'listing',
    total: 0,
    current: 0,
    errors: [],
  };
  onProgress({ ...progress });

  let files: DriveFile[];
  try {
    files = await listFiles(settings.maxDocuments);
  } catch (e) {
    progress.phase = 'error';
    progress.errors.push(`Failed to list files: ${e}`);
    onProgress({ ...progress });
    return;
  }

  progress.total = files.length;
  onProgress({ ...progress });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    progress.current = i + 1;
    progress.currentDocument = file.name;

    try {
      const existing = await db.documents.get(file.id);
      if (
        existing &&
        existing.modifiedTime === file.modifiedTime &&
        existing.status === 'indexed'
      ) {
        continue;
      }

      progress.phase = 'downloading';
      onProgress({ ...progress });

      const data = await downloadFile(file.id, file.mimeType);

      progress.phase = 'extracting';
      onProgress({ ...progress });
      const content = await extractText(data, file.mimeType);

      if (!content.text.trim()) {
        progress.errors.push(`${file.name}: no text content extracted`);
        continue;
      }

      const checksum = generateChecksum(content.text);
      if (existing && existing.checksum === checksum && existing.status === 'indexed') {
        continue;
      }

      // Remove old data if re-indexing
      if (existing) {
        const oldChunkIds = await db.chunks.where('documentId').equals(file.id).primaryKeys();
        await db.embeddings.bulkDelete(oldChunkIds);
        await db.chunks.where('documentId').equals(file.id).delete();
      }

      progress.phase = 'chunking';
      onProgress({ ...progress });
      const chunkResults = chunkText(content, settings.chunkSize, settings.chunkOverlap);

      const chunks: Chunk[] = chunkResults.map((c) => ({
        id: `${file.id}_chunk_${c.index}`,
        documentId: file.id,
        index: c.index,
        text: c.text,
        page: c.page,
        section: c.section,
      }));

      await db.chunks.bulkPut(chunks);

      progress.phase = 'embedding';
      onProgress({ ...progress });
      await computeAndStoreEmbeddings(
        chunks.map((c) => ({ id: c.id, text: c.text })),
        settings.embeddingModel
      );

      const doc: DocumentIndex = {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
        checksum,
        version: '1',
        lastIndexed: new Date(),
        chunkCount: chunks.length,
        status: 'indexed',
      };
      await db.documents.put(doc);
    } catch (e) {
      progress.errors.push(`${file.name}: ${e}`);
      await db.documents.put({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
        checksum: '',
        version: '1',
        lastIndexed: new Date(),
        chunkCount: 0,
        status: 'error',
      });
    }
  }

  progress.phase = 'done';
  onProgress({ ...progress });
}
