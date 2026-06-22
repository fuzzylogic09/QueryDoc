import { db } from '../db/database';
import type { Embedding } from '../types';

let pipeline: any = null;
let currentModel = '';

async function getPipeline(model: string) {
  if (pipeline && currentModel === model) return pipeline;
  const { pipeline: createPipeline } = await import('@xenova/transformers');
  pipeline = await createPipeline('feature-extraction', model, {
    quantized: true,
  });
  currentModel = model;
  return pipeline;
}

export async function computeEmbedding(text: string, model: string): Promise<number[]> {
  const pipe = await getPipeline(model);
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function computeAndStoreEmbeddings(
  chunks: { id: string; text: string }[],
  model: string,
  onProgress?: (i: number) => void
): Promise<void> {
  const pipe = await getPipeline(model);

  for (let i = 0; i < chunks.length; i++) {
    const output = await pipe(chunks[i].text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data as Float32Array);

    const embedding: Embedding = {
      chunkId: chunks[i].id,
      vector,
      model,
      createdAt: new Date(),
    };
    await db.embeddings.put(embedding);
    onProgress?.(i + 1);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchSimilar(
  queryVector: number[],
  topK: number
): Promise<{ chunkId: string; score: number }[]> {
  const allEmbeddings = await db.embeddings.toArray();

  const scored = allEmbeddings.map(e => ({
    chunkId: e.chunkId,
    score: cosineSimilarity(queryVector, e.vector),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
