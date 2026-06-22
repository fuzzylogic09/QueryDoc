import { useState, useEffect, useRef } from 'react';
import { authenticate, isAuthenticated, signOut, getStoredClientId } from '../services/google-drive';
import { synchronize, SyncController } from '../services/sync';
import { getStats } from '../db/database';
import { DriveBrowser } from './DriveBrowser';
import type { AppSettings, SelectedDriveItem } from '../types';
import type { ActivityLogger } from '../hooks/useActivityLog';

const SELECTED_KEY = 'querydoc_selected_items';

function loadSelectedItems(): SelectedDriveItem[] {
  try {
    const saved = localStorage.getItem(SELECTED_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveSelectedItems(items: SelectedDriveItem[]) {
  localStorage.setItem(SELECTED_KEY, JSON.stringify(items));
}

export function SyncView({ settings, logger }: { settings: AppSettings; logger: ActivityLogger }) {
  const [connected, setConnected] = useState(isAuthenticated());
  const [clientId, setClientId] = useState(getStoredClientId());
  const [stats, setStats] = useState<{ docCount: number; chunkCount: number; embCount: number } | null>(null);
  const [error, setError] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedDriveItem[]>(loadSelectedItems);
  const controllerRef = useRef<SyncController | null>(null);

  const syncing = logger.activity.syncing;

  useEffect(() => {
    getStats().then(setStats);
  }, [syncing]);

  function handleSelectionChange(items: SelectedDriveItem[]) {
    setSelectedItems(items);
    saveSelectedItems(items);
  }

  function removeSelectedItem(id: string) {
    const updated = selectedItems.filter(s => s.id !== id);
    setSelectedItems(updated);
    saveSelectedItems(updated);
  }

  function clearSelection() {
    setSelectedItems([]);
    saveSelectedItems([]);
  }

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
    if (selectedItems.length === 0) {
      setError('No files or folders selected. Use the browser above to select items to synchronize.');
      return;
    }

    const controller = new SyncController();
    controllerRef.current = controller;

    logger.updateActivity({ syncing: true, syncPhase: 'starting', syncProgress: null, syncCurrentDoc: '' });
    logger.log('info', `Synchronization started (${selectedItems.length} items selected)`, 'Sync');

    try {
      await synchronize(selectedItems, settings, (p) => {
        logger.updateActivity({
          syncPhase: p.phase,
          syncProgress: { current: p.current, total: p.total },
          syncCurrentDoc: p.currentDocument || '',
        });

        if (p.phase === 'done') {
          logger.log('success', `Synchronization complete: ${p.current} documents processed, ${p.skipped} skipped (unchanged), ${p.errors.length} errors`, 'Sync');
        } else if (p.phase === 'cancelled') {
          logger.log('warning', `Synchronization stopped at ${p.current}/${p.total}`, 'Sync');
        }

        for (const err of p.errors) {
          if (!logger.logs.some(l => l.message === err && l.source === 'Sync')) {
            logger.log('error', err, 'Sync');
          }
        }
      }, controller);

      const s = await getStats();
      setStats(s);
      logger.log('success', `Database: ${s.docCount} docs, ${s.chunkCount} chunks, ${s.embCount} embeddings`, 'Sync');
    } catch (e) {
      const msg = `Sync error: ${e}`;
      setError(msg);
      logger.log('error', msg, 'Sync');
    }

    controllerRef.current = null;
    logger.updateActivity({ syncing: false, syncPhase: '', syncProgress: null, syncCurrentDoc: '' });
  }

  function handleStop() {
    if (controllerRef.current) {
      controllerRef.current.abort();
      logger.log('warning', 'Stopping synchronization...', 'Sync');
    }
  }

  const progress = logger.activity.syncProgress;
  const pct = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  const folderCount = selectedItems.filter(i => i.isFolder).length;
  const fileCount = selectedItems.filter(i => !i.isFolder).length;

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
        <>
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>Browse Google Drive</h3>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
              Navigate folders and select files/folders to synchronize. Double-click a folder to open it.
            </p>
            <DriveBrowser selectedItems={selectedItems} onSelectionChange={handleSelectionChange} />
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3>Selected Items ({selectedItems.length})</h3>
              {selectedItems.length > 0 && (
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={clearSelection}>
                  Clear all
                </button>
              )}
            </div>
            {selectedItems.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No items selected. Browse your Drive above to add files and folders.</p>
            ) : (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
                  {folderCount} folder{folderCount !== 1 ? 's' : ''}, {fileCount} file{fileCount !== 1 ? 's' : ''} selected
                </p>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {selectedItems.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                      <span>{item.isFolder ? '\u{1F4C1}' : '\u{1F4C4}'}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.path}>
                        {item.path}
                      </span>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => removeSelectedItem(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Synchronization</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSync} disabled={syncing || selectedItems.length === 0}>
                {syncing ? 'Synchronizing...' : 'Synchronize'}
              </button>
              {syncing && (
                <button className="btn btn-danger" onClick={handleStop}>
                  Stop
                </button>
              )}
            </div>

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
        </>
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
