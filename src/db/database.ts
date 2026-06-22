import Dexie, { type Table } from 'dexie';
import type { DocumentIndex, Chunk, Embedding } from '../types';

class QueryDocDB extends Dexie {
  documents!: Table<DocumentIndex, string>;
  chunks!: Table<Chunk, string>;
  embeddings!: Table<Embedding, string>;

  constructor() {
    super('QueryDocDB');
    this.version(1).stores({
      documents: 'id, name, status',
      chunks: 'id, documentId, index',
      embeddings: 'chunkId, model',
    });
  }
}

export const db = new QueryDocDB();

export async function getStats() {
  const [docCount, chunkCount, embCount] = await Promise.all([
    db.documents.count(),
    db.chunks.count(),
    db.embeddings.count(),
  ]);
  return { docCount, chunkCount, embCount };
}

export async function clearAll() {
  await Promise.all([
    db.documents.clear(),
    db.chunks.clear(),
    db.embeddings.clear(),
  ]);
}

export async function removeDocument(docId: string) {
  const chunkIds = await db.chunks.where('documentId').equals(docId).primaryKeys();
  await db.embeddings.bulkDelete(chunkIds);
  await db.chunks.where('documentId').equals(docId).delete();
  await db.documents.delete(docId);
}
