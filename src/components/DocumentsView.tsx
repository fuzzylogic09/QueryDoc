import { useState, useEffect, useRef } from 'react';
import { db, removeDocument } from '../db/database';
import { exportDatabase, importDatabase } from '../services/import-export';
import type { DocumentIndex } from '../types';

export function DocumentsView() {
  const [docs, setDocs] = useState<DocumentIndex[]>([]);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadDocs() {
    const all = await db.documents.toArray();
    all.sort((a, b) => a.name.localeCompare(b.name));
    setDocs(all);
  }

  useEffect(() => { loadDocs(); }, []);

  async function handleRemove(id: string) {
    await removeDocument(id);
    await loadDocs();
  }

  async function handleExport() {
    const blob = await exportDatabase();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `querydoc-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Importing...');
    try {
      const result = await importDatabase(file);
      setImportStatus(`Imported ${result.documents} documents, ${result.chunks} chunks, ${result.embeddings} embeddings`);
      await loadDocs();
    } catch (err) {
      setImportStatus(`Import failed: ${err}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const mimeLabels: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.google-apps.document': 'Google Doc',
    'text/plain': 'TXT',
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3>Indexed Documents ({docs.length})</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleExport} disabled={docs.length === 0}>
              Export Database
            </button>
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              Import Database
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
          </div>
        </div>
        {importStatus && (
          <p style={{ fontSize: 13, color: importStatus.includes('failed') ? 'var(--danger)' : 'var(--success)', marginBottom: 12 }}>
            {importStatus}
          </p>
        )}
        {docs.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>No documents indexed yet. Go to Sync to connect your Google Drive, or import an existing database.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Modified</th>
                  <th>Indexed</th>
                  <th>Chunks</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.name}
                    </td>
                    <td>{mimeLabels[d.mimeType] || d.mimeType}</td>
                    <td>{new Date(d.modifiedTime).toLocaleDateString()}</td>
                    <td>{new Date(d.lastIndexed).toLocaleDateString()}</td>
                    <td>{d.chunkCount}</td>
                    <td className={`status-${d.status}`}>{d.status}</td>
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => handleRemove(d.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
