import { useState } from 'react';
import { ChatView } from './components/ChatView';
import { SyncView } from './components/SyncView';
import { DocumentsView } from './components/DocumentsView';
import { SettingsView } from './components/SettingsView';
import { StatusFooter } from './components/StatusFooter';
import { useActivityLog } from './hooks/useActivityLog';
import { DEFAULT_SETTINGS, type AppSettings } from './types';
import './App.css';

type Tab = 'chat' | 'sync' | 'documents' | 'settings';

function App() {
  const [tab, setTab] = useState<Tab>('sync');
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('querydoc_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const logger = useActivityLog();

  function updateSettings(s: AppSettings) {
    setSettings(s);
    localStorage.setItem('querydoc_settings', JSON.stringify(s));
    logger.log('info', 'Settings updated', 'Settings');
  }

  const tabs: { id: Tab; label: string; badge?: boolean }[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'sync', label: 'Sync', badge: logger.activity.syncing },
    { id: 'documents', label: 'Documents' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <h1>QueryDoc</h1>
        <p>AI Document Assistant - 100% Local</p>
      </header>
      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.badge && <span className="tab-badge" />}
          </button>
        ))}
      </nav>
      <main className="main">
        {tab === 'chat' && <ChatView settings={settings} logger={logger} />}
        {tab === 'sync' && <SyncView settings={settings} logger={logger} />}
        {tab === 'documents' && <DocumentsView />}
        {tab === 'settings' && <SettingsView settings={settings} onSave={updateSettings} />}
      </main>
      <StatusFooter logger={logger} />
    </div>
  );
}

export default App;
