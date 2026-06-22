import { db } from '../db/database';
import type { Embedding } from '../types';

let pipeline: any = null;
let currentModel = '';
let vectorCache: { chunkId: string; vector: Float32Array }[] | null = null;
let cacheVersion = 0;

async function getPipeline(model: string) {
  if (pipeline && currentModel === model) return pipeline;
  const { pipeline: createPipeline } = await import('@xenova/transformers');
  pipeline = await createPipeline('feature-extraction', model, {
    quantized: true,
  });
  currentModel = model;
  return pipeline;
}

export async function preloadEmbeddingModel(model: string): Promise<void> {
  await getPipeline(model);
}

export async function computeEmbedding(text: string, model: string): Promise<Float32Array> {
  const pipe = await getPipeline(model);
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return new Float32Array(output.data as Float32Array);
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
  invalidateCache();
}

export function invalidateCache() {
  vectorCache = null;
  cacheVersion++;
}

async function loadCache(): Promise<{ chunkId: string; vector: Float32Array }[]> {
  if (vectorCache) return vectorCache;
  const all = await db.embeddings.toArray();
  vectorCache = all.map(e => ({
    chunkId: e.chunkId,
    vector: new Float32Array(e.vector),
  }));
  return vectorCache;
}

export async function searchSimilar(
  queryVector: Float32Array,
  topK: number
): Promise<{ chunkId: string; score: number }[]> {
  const cache = await loadCache();
  const dim = queryVector.length;

  // Use a min-heap approach: track topK best scores
  const results: { chunkId: string; score: number }[] = [];
  let minScore = -Infinity;

  for (let i = 0; i < cache.length; i++) {
    const vec = cache[i].vector;
    let dot = 0;
    // Unrolled loop for SIMD-friendly execution
    let j = 0;
    for (; j + 3 < dim; j += 4) {
      dot += queryVector[j] * vec[j]
           + queryVector[j+1] * vec[j+1]
           + queryVector[j+2] * vec[j+2]
           + queryVector[j+3] * vec[j+3];
    }
    for (; j < dim; j++) {
      dot += queryVector[j] * vec[j];
    }
    // Vectors are already normalized, so dot product = cosine similarity

    if (results.length < topK) {
      results.push({ chunkId: cache[i].chunkId, score: dot });
      if (results.length === topK) {
        results.sort((a, b) => a.score - b.score);
        minScore = results[0].score;
      }
    } else if (dot > minScore) {
      results[0] = { chunkId: cache[i].chunkId, score: dot };
      results.sort((a, b) => a.score - b.score);
      minScore = results[0].score;
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
