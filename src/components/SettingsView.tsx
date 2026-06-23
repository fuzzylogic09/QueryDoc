import { useState } from 'react';
import { clearAll } from '../db/database';
import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

export function SettingsView({ settings, onSave }: { settings: AppSettings; onSave: (s: AppSettings) => void }) {
  const [local, setLocal] = useState<AppSettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  function update(field: keyof AppSettings, value: string | number) {
    setLocal({ ...local, [field]: value });
    setSaved(false);
  }

  function handleSave() {
    onSave(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setLocal({ ...DEFAULT_SETTINGS });
    onSave(DEFAULT_SETTINGS);
    setSaved(true);
  }

  async function handleClearDB() {
    if (confirm('This will delete all indexed documents, chunks, and embeddings. Continue?')) {
      await clearAll();
      alert('Database cleared.');
    }
  }

  return (
    <div>
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Indexing Settings</h3>
        <div className="field">
          <label className="label">Max Documents</label>
          <input type="number" value={local.maxDocuments} onChange={(e) => update('maxDocuments', parseInt(e.target.value) || 100)} />
        </div>
        <div className="field">
          <label className="label">Chunk Size (words)</label>
          <input type="number" value={local.chunkSize} onChange={(e) => update('chunkSize', parseInt(e.target.value) || 800)} />
        </div>
        <div className="field">
          <label className="label">Chunk Overlap (words)</label>
          <input type="number" value={local.chunkOverlap} onChange={(e) => update('chunkOverlap', parseInt(e.target.value) || 150)} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>AI Models</h3>
        <div className="field">
          <label className="label">Embedding Model</label>
          <select value={local.embeddingModel} onChange={(e) => update('embeddingModel', e.target.value)}>
            <option value="Xenova/all-MiniLM-L6-v2">all-MiniLM-L6-v2 (fast, 22MB)</option>
            <option value="Xenova/bge-small-en-v1.5">BGE Small EN (better quality, 33MB)</option>
            <option value="Xenova/bge-base-en-v1.5">BGE Base EN (high quality, 110MB)</option>
            <option value="Xenova/bge-large-en-v1.5">BGE Large EN (best quality, 335MB)</option>
            <option value="nomic-ai/nomic-embed-text-v1">Nomic Embed Text v1 (137MB)</option>
            <option value="mixedbread-ai/mxbai-embed-large-v1">Mixedbread Embed Large (335MB)</option>
          </select>
        </div>
        <div className="field">
          <label className="label">LLM Model (WebLLM)</label>
          <select value={local.llmModel} onChange={(e) => update('llmModel', e.target.value)}>
            <option value="Qwen2.5-0.5B-Instruct-q4f16_1-MLC">Qwen2.5 0.5B (smallest, ~300MB)</option>
            <option value="Qwen2.5-1.5B-Instruct-q4f16_1-MLC">Qwen2.5 1.5B (better, ~900MB)</option>
            <option value="Llama-3.2-1B-Instruct-q4f16_1-MLC">Llama 3.2 1B (~700MB)</option>
            <option value="Llama-3.2-3B-Instruct-q4f16_1-MLC">Llama 3.2 3B (~1.8GB)</option>
            <option value="SmolLM2-360M-Instruct-q4f16_1-MLC">SmolLM2 360M (tiny, ~200MB)</option>
          </select>
        </div>
        <div className="field">
          <label className="label">Top K Results</label>
          <input type="number" value={local.topK} onChange={(e) => update('topK', parseInt(e.target.value) || 5)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
        <button className="btn btn-secondary" onClick={handleReset}>Reset to Defaults</button>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12, color: 'var(--danger)' }}>Danger Zone</h3>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
          Clear all indexed documents, chunks, and embeddings from IndexedDB.
        </p>
        <button className="btn btn-danger" onClick={handleClearDB}>Clear All Data</button>
      </div>
    </div>
  );
}
