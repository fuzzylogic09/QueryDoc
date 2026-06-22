import { useState, useEffect } from 'react';
import { db, removeDocument } from '../db/database';
import type { DocumentIndex } from '../types';

export function DocumentsView() {
  const [docs, setDocs] = useState<DocumentIndex[]>([]);

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

  const mimeLabels: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.google-apps.document': 'Google Doc',
    'text/plain': 'TXT',
  };

  return (
    <div>
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Indexed Documents ({docs.length})</h3>
        {docs.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>No documents indexed yet. Go to Sync to connect your Google Drive.</p>
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
