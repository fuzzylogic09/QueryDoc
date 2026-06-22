import { useState } from 'react';
import { ChatView } from './components/ChatView';
import { SyncView } from './components/SyncView';
import { DocumentsView } from './components/DocumentsView';
import { SettingsView } from './components/SettingsView';
import { DEFAULT_SETTINGS, type AppSettings } from './types';
import './App.css';

type Tab = 'chat' | 'sync' | 'documents' | 'settings';

function App() {
  const [tab, setTab] = useState<Tab>('sync');
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('querydoc_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  function updateSettings(s: AppSettings) {
    setSettings(s);
    localStorage.setItem('querydoc_settings', JSON.stringify(s));
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'sync', label: 'Sync' },
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
          </button>
        ))}
      </nav>
      <main className="main">
        {tab === 'chat' && <ChatView settings={settings} />}
        {tab === 'sync' && <SyncView settings={settings} />}
        {tab === 'documents' && <DocumentsView />}
        {tab === 'settings' && <SettingsView settings={settings} onSave={updateSettings} />}
      </main>
    </div>
  );
}

export default App;
