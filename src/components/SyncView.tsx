import { useState } from 'react';
import { authenticate, isAuthenticated, signOut, getStoredClientId } from '../services/google-drive';
import { synchronize } from '../services/sync';
import { getStats } from '../db/database';
import type { SyncProgress, AppSettings } from '../types';

export function SyncView({ settings }: { settings: AppSettings }) {
  const [connected, setConnected] = useState(isAuthenticated());
  const [clientId, setClientId] = useState(getStoredClientId());
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [stats, setStats] = useState<{ docCount: number; chunkCount: number; embCount: number } | null>(null);
  const [error, setError] = useState('');

  async function handleConnect() {
    if (!clientId.trim()) {
      setError('Please enter your Google OAuth Client ID');
      return;
    }
    setError('');
    try {
      await authenticate(clientId);
      setConnected(true);
    } catch (e) {
      setError(`Authentication failed: ${e}`);
    }
  }

  function handleDisconnect() {
    signOut();
    setConnected(false);
  }

  async function handleSync() {
    setSyncing(true);
    setProgress(null);
    try {
      await synchronize(settings, (p) => setProgress({ ...p }));
      const s = await getStats();
      setStats(s);
    } catch (e) {
      setError(`Sync error: ${e}`);
    }
    setSyncing(false);
  }

  async function loadStats() {
    const s = await getStats();
    setStats(s);
  }

  if (!stats) loadStats();

  const pct = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div>
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Google Drive Connection</h3>
        {!connected ? (
          <>
            <div className="field">
              <label className="label">Google OAuth 2.0 Client ID</label>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="your-client-id.apps.googleusercontent.com"
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              Create a Client ID in Google Cloud Console with JavaScript origins set to your GitHub Pages URL.
            </p>
            <button className="btn btn-primary" onClick={handleConnect}>
              Connect Google Drive
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="status-indexed">Connected</span>
            <button className="btn btn-secondary" onClick={handleDisconnect}>Disconnect</button>
          </div>
        )}
        {error && <p style={{ color: 'var(--danger)', marginTop: 8, fontSize: 13 }}>{error}</p>}
      </div>

      {connected && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Synchronization</h3>
          <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Synchronizing...' : 'Synchronize'}
          </button>

          {progress && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-dim)' }}>
                <span>Phase: {progress.phase}</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              {progress.currentDocument && (
                <p style={{ fontSize: 13, marginTop: 4 }}>{progress.currentDocument}</p>
              )}
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              {progress.errors.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--danger)' }}>Errors ({progress.errors.length}):</p>
                  {progress.errors.map((e, i) => (
                    <p key={i} style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {stats && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Local Database</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{stats.docCount}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Documents</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{stats.chunkCount}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Chunks</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{stats.embCount}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Embeddings</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
