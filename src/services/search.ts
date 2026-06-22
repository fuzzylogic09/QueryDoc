import { db } from '../db/database';
import { computeEmbedding, searchSimilar } from './embeddings';
import { generateResponse } from './llm';
import type { SearchResult, AppSettings } from '../types';

export async function answerQuestion(
  question: string,
  settings: AppSettings
): Promise<{ answer: string; sources: SearchResult[] }> {
  const queryVector = await computeEmbedding(question, settings.embeddingModel);
  const results = await searchSimilar(queryVector, settings.topK);

  const sources: SearchResult[] = [];
  const contextChunks: { text: string; documentName: string; section?: string }[] = [];

  for (const r of results) {
    const chunk = await db.chunks.get(r.chunkId);
    if (!chunk) continue;
    const doc = await db.documents.get(chunk.documentId);
    const docName = doc?.name || 'Unknown';
    sources.push({ chunk, documentName: docName, score: r.score });
    contextChunks.push({ text: chunk.text, documentName: docName, section: chunk.section });
  }

  const answer = await generateResponse(question, contextChunks);
  return { answer, sources };
}
