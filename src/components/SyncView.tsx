import { useState, useEffect } from 'react';
import { authenticate, isAuthenticated, signOut, getStoredClientId } from '../services/google-drive';
import { synchronize } from '../services/sync';
import { getStats } from '../db/database';
import type { AppSettings } from '../types';
import type { ActivityLogger } from '../hooks/useActivityLog';

export function SyncView({ settings, logger }: { settings: AppSettings; logger: ActivityLogger }) {
  const [connected, setConnected] = useState(isAuthenticated());
  const [clientId, setClientId] = useState(getStoredClientId());
  const [stats, setStats] = useState<{ docCount: number; chunkCount: number; embCount: number } | null>(null);
  const [error, setError] = useState('');

  const syncing = logger.activity.syncing;

  useEffect(() => {
    getStats().then(setStats);
  }, [syncing]);

  async function handleConnect() {
    if (!clientId.trim()) {
      setError('Please enter your Google OAuth Client ID');
      return;
    }
    setError('');
    try {
      logger.log('info', 'Connecting to Google Drive...', 'Sync');
      await authenticate(clientId);
      setConnected(true);
      logger.log('success', 'Connected to Google Drive', 'Sync');
    } catch (e) {
      const msg = `Authentication failed: ${e}`;
      setError(msg);
      logger.log('error', msg, 'Sync');
    }
  }

  function handleDisconnect() {
    signOut();
    setConnected(false);
    logger.log('info', 'Disconnected from Google Drive', 'Sync');
  }

  async function handleSync() {
    logger.updateActivity({ syncing: true, syncPhase: 'starting', syncProgress: null, syncCurrentDoc: '' });
    logger.log('info', 'Synchronization started', 'Sync');

    try {
      await synchronize(settings, (p) => {
        logger.updateActivity({
          syncPhase: p.phase,
          syncProgress: { current: p.current, total: p.total },
          syncCurrentDoc: p.currentDocument || '',
        });

        if (p.phase === 'done') {
          logger.log('success', `Synchronization complete: ${p.current} documents processed, ${p.errors.length} errors`, 'Sync');
        }

        for (const err of p.errors) {
          if (!logger.logs.some(l => l.message === err && l.source === 'Sync')) {
            logger.log('error', err, 'Sync');
          }
        }
      });

      const s = await getStats();
      setStats(s);
      logger.log('success', `Database: ${s.docCount} docs, ${s.chunkCount} chunks, ${s.embCount} embeddings`, 'Sync');
    } catch (e) {
      const msg = `Sync error: ${e}`;
      setError(msg);
      logger.log('error', msg, 'Sync');
    }

    logger.updateActivity({ syncing: false, syncPhase: '', syncProgress: null, syncCurrentDoc: '' });
  }

  const progress = logger.activity.syncProgress;
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

          {syncing && progress && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-dim)' }}>
                <span>Phase: {logger.activity.syncPhase}</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              {logger.activity.syncCurrentDoc && (
                <p style={{ fontSize: 13, marginTop: 4 }}>{logger.activity.syncCurrentDoc}</p>
              )}
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {!syncing && progress && progress.total > 0 && (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--success)' }}>
              Last sync: {progress.current}/{progress.total} documents processed
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
