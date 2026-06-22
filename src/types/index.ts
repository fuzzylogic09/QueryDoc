export interface DocumentIndex {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  checksum: string;
  version: string;
  lastIndexed: Date;
  chunkCount: number;
  status: 'indexed' | 'error' | 'processing';
}

export interface Chunk {
  id: string;
  documentId: string;
  index: number;
  text: string;
  page?: number;
  section?: string;
}

export interface Embedding {
  chunkId: string;
  vector: number[];
  model: string;
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  timestamp: Date;
  durationMs?: number;
}

export interface SearchResult {
  chunk: Chunk;
  documentName: string;
  score: number;
}

export interface SyncProgress {
  phase: 'listing' | 'downloading' | 'extracting' | 'chunking' | 'embedding' | 'done' | 'error' | 'cancelled';
  total: number;
  current: number;
  currentDocument?: string;
  errors: string[];
  skipped: number;
}

export interface SelectedDriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  path: string;
}

export interface AppSettings {
  maxDocuments: number;
  chunkSize: number;
  chunkOverlap: number;
  embeddingModel: string;
  llmModel: string;
  topK: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  maxDocuments: 100,
  chunkSize: 800,
  chunkOverlap: 150,
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  llmModel: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  topK: 5,
};
