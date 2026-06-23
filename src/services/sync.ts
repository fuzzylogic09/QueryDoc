import { db } from '../db/database';
import { downloadFile, listFilesRecursive, getFileInfo, isSupportedType, type DriveFile } from './google-drive';
import { extractText } from './extractor';
import { chunkText } from './chunker';
import { computeAndStoreEmbeddings } from './embeddings';
import type { DocumentIndex, Chunk, SyncProgress, AppSettings, SelectedDriveItem } from '../types';

function generateChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return hash.toString(36);
}

export class SyncController {
  private aborted = false;

  abort() {
    this.aborted = true;
  }

  get isAborted() {
    return this.aborted;
  }
}

export async function synchronize(
  selectedItems: SelectedDriveItem[],
  settings: AppSettings,
  onProgress: (p: SyncProgress) => void,
  controller: SyncController
): Promise<void> {
  const progress: SyncProgress = {
    phase: 'listing',
    total: 0,
    current: 0,
    errors: [],
    skipped: 0,
  };
  onProgress({ ...progress });

  if (controller.isAborted) { progress.phase = 'cancelled'; onProgress({ ...progress }); return; }

  // Resolve all selected items to flat file list
  const files: DriveFile[] = [];
  try {
    for (const item of selectedItems) {
      if (controller.isAborted) break;
      if (item.isFolder) {
        const folderFiles = await listFilesRecursive(item.id, settings.maxDocuments - files.length);
        files.push(...folderFiles);
      } else if (isSupportedType(item.mimeType)) {
        const info = await getFileInfo(item.id);
        files.push(info);
      }
      if (files.length >= settings.maxDocuments) break;
    }
  } catch (e) {
    progress.phase = 'error';
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    progress.errors.push(`Failed to list files: ${msg}`);
    onProgress({ ...progress });
    return;
  }

  if (controller.isAborted) { progress.phase = 'cancelled'; onProgress({ ...progress }); return; }

  const filesToProcess = files.slice(0, settings.maxDocuments);
  progress.total = filesToProcess.length;
  onProgress({ ...progress });

  for (let i = 0; i < filesToProcess.length; i++) {
    if (controller.isAborted) {
      progress.phase = 'cancelled';
      onProgress({ ...progress });
      return;
    }

    const file = filesToProcess[i];
    progress.current = i + 1;
    progress.currentDocument = file.name;

    try {
      const existing = await db.documents.get(file.id);
      if (
        existing &&
        existing.modifiedTime === file.modifiedTime &&
        existing.status === 'indexed'
      ) {
        progress.skipped++;
        continue;
      }

      progress.phase = 'downloading';
      onProgress({ ...progress });
      const data = await downloadFile(file.id, file.mimeType);

      if (controller.isAborted) { progress.phase = 'cancelled'; onProgress({ ...progress }); return; }

      progress.phase = 'extracting';
      onProgress({ ...progress });
      const content = await extractText(data, file.mimeType);

      if (!content.text.trim()) {
        progress.errors.push(`${file.name}: no text content extracted`);
        continue;
      }

      const checksum = generateChecksum(content.text);
      if (existing && existing.checksum === checksum && existing.status === 'indexed') {
        progress.skipped++;
        continue;
      }

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

      if (controller.isAborted) { progress.phase = 'cancelled'; onProgress({ ...progress }); return; }

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
        metadata: content.metadata,
        textLength: content.text.length,
      };
      await db.documents.put(doc);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : JSON.stringify(e);
      progress.errors.push(`${file.name}: ${errMsg}`);
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

  if (!controller.isAborted) {
    progress.phase = 'done';
    onProgress({ ...progress });
  }
}
