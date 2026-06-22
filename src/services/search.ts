import { db } from '../db/database';
import { computeEmbedding, searchSimilar } from './embeddings';
import { generateResponseStreaming } from './llm';
import type { SearchResult, AppSettings } from '../types';

export type SearchStep =
  | { step: 'embedding'; message: string }
  | { step: 'searching'; message: string }
  | { step: 'found'; message: string; count: number }
  | { step: 'generating'; message: string }
  | { step: 'streaming'; message: string; partial: string }
  | { step: 'done'; message: string; durationMs: number };

export interface SearchCallbacks {
  onStep?: (step: SearchStep) => void;
  onToken?: () => void;
}

export async function answerQuestion(
  question: string,
  settings: AppSettings,
  callbacks?: SearchCallbacks
): Promise<{ answer: string; sources: SearchResult[]; durationMs: number }> {
  const t0 = performance.now();
  const { onStep, onToken } = callbacks || {};

  onStep?.({ step: 'embedding', message: 'Computing question embedding...' });
  const queryVector = await computeEmbedding(question, settings.embeddingModel);

  const embCount = await db.embeddings.count();
  onStep?.({ step: 'searching', message: `Searching ${embCount} vectors...` });
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

  const uniqueDocs = new Set(sources.map(s => s.documentName)).size;
  onStep?.({ step: 'found', message: `Found ${sources.length} relevant chunks from ${uniqueDocs} documents`, count: sources.length });

  onStep?.({ step: 'generating', message: 'Generating response...' });

  const answer = await generateResponseStreaming(question, contextChunks, (_token, fullText) => {
    onToken?.();
    onStep?.({ step: 'streaming', message: 'Generating response...', partial: fullText });
  });

  const durationMs = Math.round(performance.now() - t0);
  onStep?.({ step: 'done', message: `Completed in ${(durationMs / 1000).toFixed(1)}s`, durationMs });

  return { answer, sources, durationMs };
}
