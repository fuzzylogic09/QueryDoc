import { db } from '../db/database';
import { invalidateCache } from './embeddings';
import type { DocumentIndex, Chunk, Embedding } from '../types';

interface ExportData {
  version: 1;
  exportedAt: string;
  documents: DocumentIndex[];
  chunks: Chunk[];
  embeddings: Embedding[];
}

export async function exportDatabase(): Promise<Blob> {
  const [documents, chunks, embeddings] = await Promise.all([
    db.documents.toArray(),
    db.chunks.toArray(),
    db.embeddings.toArray(),
  ]);

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    documents,
    chunks,
    embeddings,
  };

  const json = JSON.stringify(data);
  return new Blob([json], { type: 'application/json' });
}

export async function importDatabase(file: File): Promise<{ documents: number; chunks: number; embeddings: number }> {
  const text = await file.text();
  const data: ExportData = JSON.parse(text);

  if (data.version !== 1) {
    throw new Error(`Unsupported export version: ${data.version}`);
  }

  // Restore Date objects
  for (const doc of data.documents) {
    doc.lastIndexed = new Date(doc.lastIndexed);
  }
  for (const emb of data.embeddings) {
    emb.createdAt = new Date(emb.createdAt);
  }

  await Promise.all([
    db.documents.bulkPut(data.documents),
    db.chunks.bulkPut(data.chunks),
    db.embeddings.bulkPut(data.embeddings),
  ]);

  invalidateCache();

  return {
    documents: data.documents.length,
    chunks: data.chunks.length,
    embeddings: data.embeddings.length,
  };
}
