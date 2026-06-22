import { db } from '../db/database';
import { computeEmbedding, searchSimilar } from './embeddings';
import { generateResponse } from './llm';
import type { SearchResult, AppSettings } from '../types';

export type SearchStep =
  | { step: 'embedding'; message: string }
  | { step: 'searching'; message: string }
  | { step: 'found'; message: string; count: number }
  | { step: 'generating'; message: string }
  | { step: 'done'; message: string; durationMs: number };

export async function answerQuestion(
  question: string,
  settings: AppSettings,
  onStep?: (step: SearchStep) => void
): Promise<{ answer: string; sources: SearchResult[]; durationMs: number }> {
  const t0 = performance.now();

  onStep?.({ step: 'embedding', message: 'Computing question embedding...' });
  const queryVector = await computeEmbedding(question, settings.embeddingModel);

  onStep?.({ step: 'searching', message: `Searching ${await db.embeddings.count()} vectors...` });
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

  onStep?.({ step: 'found', message: `Found ${sources.length} relevant chunks from ${new Set(sources.map(s => s.documentName)).size} documents`, count: sources.length });

  onStep?.({ step: 'generating', message: 'Generating response with local LLM...' });
  const answer = await generateResponse(question, contextChunks);

  const durationMs = Math.round(performance.now() - t0);
  onStep?.({ step: 'done', message: `Completed in ${(durationMs / 1000).toFixed(1)}s`, durationMs });

  return { answer, sources, durationMs };
}
