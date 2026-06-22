import { useState, useEffect } from 'react';
import { listFolder, type DriveItem } from '../services/google-drive';
import type { SelectedDriveItem } from '../types';
import './DriveBrowser.css';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface Props {
  selectedItems: SelectedDriveItem[];
  onSelectionChange: (items: SelectedDriveItem[]) => void;
}

export function DriveBrowser({ selectedItems, onSelectionChange }: Props) {
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'root', name: 'My Drive' },
  ]);

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;
  const currentPath = breadcrumbs.map(b => b.name).join('/');

  useEffect(() => {
    loadFolder(currentFolderId);
  }, [currentFolderId]);

  async function loadFolder(folderId: string) {
    setLoading(true);
    setError('');
    try {
      const result = await listFolder(folderId);
      setItems(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  function navigateToFolder(item: DriveItem) {
    setBreadcrumbs([...breadcrumbs, { id: item.id, name: item.name }]);
  }

  function navigateToBreadcrumb(index: number) {
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
  }

  function isSelected(id: string): boolean {
    return selectedItems.some(s => s.id === id);
  }

  function toggleItem(item: DriveItem) {
    if (isSelected(item.id)) {
      onSelectionChange(selectedItems.filter(s => s.id !== item.id));
    } else {
      onSelectionChange([
        ...selectedItems,
        {
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          isFolder: item.isFolder,
          path: currentPath + '/' + item.name,
        },
      ]);
    }
  }

  function addAllFiles() {
    const fileItems = items.filter(i => !i.isFolder && !isSelected(i.id));
    const newSelected = fileItems.map(item => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      isFolder: false,
      path: currentPath + '/' + item.name,
    }));
    onSelectionChange([...selectedItems, ...newSelected]);
  }

  function addCurrentFolder() {
    const current = breadcrumbs[breadcrumbs.length - 1];
    if (isSelected(current.id)) return;
    onSelectionChange([
      ...selectedItems,
      {
        id: current.id,
        name: current.name,
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: true,
        path: currentPath,
      },
    ]);
  }

  const mimeIcons: Record<string, string> = {
    'application/vnd.google-apps.folder': '\u{1F4C1}',
    'application/pdf': '\u{1F4C4}',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '\u{1F4DD}',
    'application/vnd.google-apps.document': '\u{1F4D1}',
    'text/plain': '\u{1F4C3}',
  };

  const folders = items.filter(i => i.isFolder);
  const files = items.filter(i => !i.isFolder);

  return (
    <div className="drive-browser">
      <div className="browser-toolbar">
        <div className="breadcrumbs">
          {breadcrumbs.map((b, i) => (
            <span key={b.id}>
              {i > 0 && <span className="breadcrumb-sep">/</span>}
              <button
                className={`breadcrumb ${i === breadcrumbs.length - 1 ? 'current' : ''}`}
                onClick={() => navigateToBreadcrumb(i)}
              >
                {b.name}
              </button>
            </span>
          ))}
        </div>
        <div className="browser-actions">
          <button className="btn btn-secondary btn-sm" onClick={addCurrentFolder} disabled={isSelected(currentFolderId)}>
            Add folder
          </button>
          <button className="btn btn-secondary btn-sm" onClick={addAllFiles} disabled={files.length === 0}>
            Add all files
          </button>
        </div>
      </div>

      {error && <p className="browser-error">{error}</p>}

      {loading ? (
        <div className="browser-loading">Loading...</div>
      ) : (
        <div className="browser-list">
          {folders.length === 0 && files.length === 0 && (
            <div className="browser-empty">This folder is empty or contains no supported files.</div>
          )}
          {folders.map(item => (
            <div key={item.id} className="browser-item folder" onDoubleClick={() => navigateToFolder(item)}>
              <label className="browser-item-check">
                <input type="checkbox" checked={isSelected(item.id)} onChange={() => toggleItem(item)} />
              </label>
              <span className="browser-icon">{mimeIcons[item.mimeType] || '\u{1F4C1}'}</span>
              <span className="browser-name clickable" onClick={() => navigateToFolder(item)}>
                {item.name}
              </span>
              <span className="browser-meta">folder</span>
            </div>
          ))}
          {files.map(item => (
            <div key={item.id} className={`browser-item file ${isSelected(item.id) ? 'selected' : ''}`}>
              <label className="browser-item-check">
                <input type="checkbox" checked={isSelected(item.id)} onChange={() => toggleItem(item)} />
              </label>
              <span className="browser-icon">{mimeIcons[item.mimeType] || '\u{1F4C3}'}</span>
              <span className="browser-name">{item.name}</span>
              <span className="browser-meta">
                {item.size ? `${Math.round(parseInt(item.size) / 1024)} KB` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
