import { db } from '../db/database';

export interface DocNode {
  id: string;
  name: string;
  mimeType: string;
  chunkCount: number;
  cluster: number;
}

export interface DocEdge {
  source: string;
  target: string;
  weight: number;
}

export interface DocGraph {
  nodes: DocNode[];
  edges: DocEdge[];
}

export async function computeDocumentEmbeddings(): Promise<Map<string, Float32Array>> {
  const docs = await db.documents.where('status').equals('indexed').toArray();
  const docEmbeddings = new Map<string, Float32Array>();

  for (const doc of docs) {
    const chunks = await db.chunks.where('documentId').equals(doc.id).toArray();
    if (chunks.length === 0) continue;

    const chunkIds = chunks.map(c => c.id);
    const embeddings = await db.embeddings.where('chunkId').anyOf(chunkIds).toArray();
    if (embeddings.length === 0) continue;

    const dim = embeddings[0].vector.length;
    const mean = new Float32Array(dim);

    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        mean[i] += emb.vector[i];
      }
    }

    let norm = 0;
    for (let i = 0; i < dim; i++) {
      mean[i] /= embeddings.length;
      norm += mean[i] * mean[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dim; i++) mean[i] /= norm;
    }

    docEmbeddings.set(doc.id, mean);
  }

  return docEmbeddings;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function assignClusters(nodes: DocNode[], edges: DocEdge[]): void {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  let cluster = 0;
  const visited = new Set<string>();
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const n = nodes.find(n => n.id === cur)!;
      n.cluster = cluster;
      for (const neighbor of adj.get(cur)!) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    cluster++;
  }
}

export async function buildDocGraph(
  threshold: number = 0.5,
  topK: number = 5,
  onProgress?: (current: number, total: number) => void
): Promise<DocGraph> {
  const docEmbeddings = await computeDocumentEmbeddings();
  const docs = await db.documents.where('status').equals('indexed').toArray();

  const entries = docs
    .filter(d => docEmbeddings.has(d.id))
    .map(d => ({
      id: d.id,
      name: d.name,
      mimeType: d.mimeType,
      chunkCount: d.chunkCount,
      embedding: docEmbeddings.get(d.id)!,
    }));

  const nodes: DocNode[] = entries.map(e => ({
    id: e.id,
    name: e.name,
    mimeType: e.mimeType,
    chunkCount: e.chunkCount,
    cluster: 0,
  }));

  const edgeSet = new Set<string>();
  const edges: DocEdge[] = [];
  const total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    onProgress?.(i + 1, total);
    const a = entries[i];
    const scores: { idx: number; score: number }[] = [];

    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      scores.push({ idx: j, score: cosine(a.embedding, entries[j].embedding) });
    }

    scores.sort((x, y) => y.score - x.score);
    const neighbors = scores.slice(0, topK);

    for (const n of neighbors) {
      if (n.score < threshold) continue;
      const key = [a.id, entries[n.idx].id].sort().join('|');
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ source: a.id, target: entries[n.idx].id, weight: n.score });
    }
  }

  assignClusters(nodes, edges);

  return { nodes, edges };
}
