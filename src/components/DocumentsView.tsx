import { useState, useEffect, useRef } from 'react';
import { db, removeDocument } from '../db/database';
import { exportDatabase, importDatabase } from '../services/import-export';
import type { DocumentIndex, Chunk, Embedding } from '../types';
import './DocumentsView.css';

interface DocDetail {
  doc: DocumentIndex;
  chunks: Chunk[];
  embeddings: Map<string, Embedding>;
  totalEmbeddingDim: number;
  totalTextLength: number;
}

export function DocumentsView() {
  const [docs, setDocs] = useState<DocumentIndex[]>([]);
  const [importStatus, setImportStatus] = useState('');
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());
  const [showEmbedding, setShowEmbedding] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadDocs() {
    const all = await db.documents.toArray();
    all.sort((a, b) => a.name.localeCompare(b.name));
    setDocs(all);
  }

  useEffect(() => { loadDocs(); }, []);

  async function handleRemove(id: string) {
    await removeDocument(id);
    if (detail?.doc.id === id) setDetail(null);
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

  async function inspectDocument(doc: DocumentIndex) {
    const chunks = await db.chunks.where('documentId').equals(doc.id).sortBy('index');
    const chunkIds = chunks.map(c => c.id);
    const embList = await db.embeddings.where('chunkId').anyOf(chunkIds).toArray();
    const embeddings = new Map(embList.map(e => [e.chunkId, e]));
    const totalEmbeddingDim = embList.length > 0 ? embList[0].vector.length : 0;
    const totalTextLength = chunks.reduce((sum, c) => sum + c.text.length, 0);
    setDetail({ doc, chunks, embeddings, totalEmbeddingDim, totalTextLength });
    setExpandedChunks(new Set());
    setShowEmbedding(null);
  }

  function toggleChunk(index: number) {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  const mimeLabels: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.google-apps.document': 'Google Doc',
    'text/plain': 'TXT',
  };

  function formatVector(vec: number[]): string {
    const first5 = vec.slice(0, 5).map(v => v.toFixed(4)).join(', ');
    return `[${first5}, ... (${vec.length} dims)]`;
  }

  function vectorMagnitude(vec: number[]): string {
    let sum = 0;
    for (const v of vec) sum += v * v;
    return Math.sqrt(sum).toFixed(4);
  }

  function vectorStats(vec: number[]): { min: number; max: number; mean: number } {
    let min = Infinity, max = -Infinity, sum = 0;
    for (const v of vec) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return { min, max, mean: sum / vec.length };
  }

  return (
    <div className="docs-layout">
      <div className={detail ? 'docs-main docs-main-narrow' : 'docs-main'}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3>Indexed Documents ({docs.length})</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={handleExport} disabled={docs.length === 0}>
                Export
              </button>
              <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                Import
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
                    <th>Chunks</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr
                      key={d.id}
                      className={`doc-row ${detail?.doc.id === d.id ? 'doc-row-selected' : ''}`}
                      onClick={() => inspectDocument(d)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.name}
                      </td>
                      <td>{mimeLabels[d.mimeType] || d.mimeType}</td>
                      <td>{new Date(d.modifiedTime).toLocaleDateString()}</td>
                      <td>{d.chunkCount}</td>
                      <td className={`status-${d.status}`}>{d.status}</td>
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={(e) => { e.stopPropagation(); handleRemove(d.id); }}
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

      {detail && (
        <div className="doc-detail-panel">
          <div className="detail-panel-header">
            <h3>{detail.doc.name}</h3>
            <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setDetail(null)}>Close</button>
          </div>

          {/* Summary stats */}
          <div className="detail-panel-section">
            <h4>Summary</h4>
            <div className="detail-stats-grid">
              <div className="detail-stat">
                <span className="detail-stat-value">{detail.chunks.length}</span>
                <span className="detail-stat-label">Chunks</span>
              </div>
              <div className="detail-stat">
                <span className="detail-stat-value">{detail.embeddings.size}</span>
                <span className="detail-stat-label">Embeddings</span>
              </div>
              <div className="detail-stat">
                <span className="detail-stat-value">{detail.totalEmbeddingDim}</span>
                <span className="detail-stat-label">Dimensions</span>
              </div>
              <div className="detail-stat">
                <span className="detail-stat-value">{(detail.totalTextLength / 1000).toFixed(1)}k</span>
                <span className="detail-stat-label">Characters</span>
              </div>
            </div>
          </div>

          {/* Metadata */}
          {detail.doc.metadata && Object.values(detail.doc.metadata).some(v => v) && (
            <div className="detail-panel-section">
              <h4>Document Metadata</h4>
              <div className="metadata-grid">
                {detail.doc.metadata.title && <div className="meta-row"><span className="meta-key">Title</span><span className="meta-val">{detail.doc.metadata.title}</span></div>}
                {detail.doc.metadata.author && <div className="meta-row"><span className="meta-key">Author</span><span className="meta-val">{detail.doc.metadata.author}</span></div>}
                {detail.doc.metadata.subject && <div className="meta-row"><span className="meta-key">Subject</span><span className="meta-val">{detail.doc.metadata.subject}</span></div>}
                {detail.doc.metadata.keywords && <div className="meta-row"><span className="meta-key">Keywords</span><span className="meta-val">{detail.doc.metadata.keywords}</span></div>}
                {detail.doc.metadata.creator && <div className="meta-row"><span className="meta-key">Creator</span><span className="meta-val">{detail.doc.metadata.creator}</span></div>}
                {detail.doc.metadata.producer && <div className="meta-row"><span className="meta-key">Producer</span><span className="meta-val">{detail.doc.metadata.producer}</span></div>}
                {detail.doc.metadata.creationDate && <div className="meta-row"><span className="meta-key">Created</span><span className="meta-val">{detail.doc.metadata.creationDate}</span></div>}
                {detail.doc.metadata.modDate && <div className="meta-row"><span className="meta-key">Modified</span><span className="meta-val">{detail.doc.metadata.modDate}</span></div>}
                {detail.doc.metadata.pageCount && <div className="meta-row"><span className="meta-key">Pages</span><span className="meta-val">{detail.doc.metadata.pageCount}</span></div>}
              </div>
            </div>
          )}

          {/* Index info */}
          <div className="detail-panel-section">
            <h4>Index Info</h4>
            <div className="metadata-grid">
              <div className="meta-row"><span className="meta-key">Type</span><span className="meta-val">{mimeLabels[detail.doc.mimeType] || detail.doc.mimeType}</span></div>
              <div className="meta-row"><span className="meta-key">Status</span><span className={`meta-val status-${detail.doc.status}`}>{detail.doc.status}</span></div>
              <div className="meta-row"><span className="meta-key">Last Indexed</span><span className="meta-val">{new Date(detail.doc.lastIndexed).toLocaleString()}</span></div>
              <div className="meta-row"><span className="meta-key">Checksum</span><span className="meta-val">{detail.doc.checksum}</span></div>
              {detail.embeddings.size > 0 && (() => {
                const firstEmb = [...detail.embeddings.values()][0];
                return <div className="meta-row"><span className="meta-key">Embedding Model</span><span className="meta-val">{firstEmb.model}</span></div>;
              })()}
            </div>
          </div>

          {/* Chunks */}
          <div className="detail-panel-section">
            <h4>Chunks ({detail.chunks.length})</h4>
            <div className="chunks-list">
              {detail.chunks.map((chunk) => {
                const emb = detail.embeddings.get(chunk.id);
                const isExpanded = expandedChunks.has(chunk.index);
                const showEmb = showEmbedding === chunk.id;

                return (
                  <div key={chunk.id} className="chunk-item">
                    <div className="chunk-header" onClick={() => toggleChunk(chunk.index)}>
                      <span className="chunk-index">#{chunk.index + 1}</span>
                      <span className="chunk-preview">
                        {isExpanded ? '' : chunk.text.slice(0, 80) + (chunk.text.length > 80 ? '...' : '')}
                      </span>
                      <span className="chunk-meta-badges">
                        {chunk.page && <span className="chunk-badge">p.{chunk.page}</span>}
                        {chunk.section && <span className="chunk-badge">{chunk.section.slice(0, 20)}</span>}
                        <span className="chunk-badge">{chunk.text.split(/\s+/).length}w</span>
                        {emb && <span className="chunk-badge emb-badge">{emb.vector.length}d</span>}
                      </span>
                      <span className="chunk-expand">{isExpanded ? '▾' : '▸'}</span>
                    </div>
                    {isExpanded && (
                      <div className="chunk-body">
                        <div className="chunk-text-full">{chunk.text}</div>
                        <div className="chunk-details-row">
                          <span>Words: {chunk.text.split(/\s+/).length}</span>
                          <span>Chars: {chunk.text.length}</span>
                          {chunk.page && <span>Page: {chunk.page}</span>}
                          {chunk.section && <span>Section: {chunk.section}</span>}
                        </div>
                        {emb && (
                          <div className="chunk-embedding-section">
                            <div className="chunk-emb-header">
                              <span>Embedding: {emb.vector.length} dims, model: {emb.model}</span>
                              <button className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: 10 }}
                                onClick={(e) => { e.stopPropagation(); setShowEmbedding(showEmb ? null : chunk.id); }}>
                                {showEmb ? 'Hide vector' : 'Show vector'}
                              </button>
                            </div>
                            <div className="chunk-emb-stats">
                              <span>Magnitude: {vectorMagnitude(emb.vector)}</span>
                              {(() => {
                                const s = vectorStats(emb.vector);
                                return <>
                                  <span>Min: {s.min.toFixed(4)}</span>
                                  <span>Max: {s.max.toFixed(4)}</span>
                                  <span>Mean: {s.mean.toFixed(6)}</span>
                                </>;
                              })()}
                            </div>
                            {!showEmb && (
                              <div className="chunk-emb-preview">{formatVector(emb.vector)}</div>
                            )}
                            {showEmb && (
                              <div className="chunk-emb-full">
                                {emb.vector.map((v, i) => (
                                  <span key={i} className="emb-val" style={{
                                    background: `rgba(108, 99, 255, ${Math.min(1, Math.abs(v) * 5)})`,
                                  }}>{v.toFixed(4)}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
