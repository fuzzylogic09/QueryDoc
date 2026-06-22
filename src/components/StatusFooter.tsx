import { useState } from 'react';
import type { ActivityLogger } from '../hooks/useActivityLog';
import './StatusFooter.css';

export function StatusFooter({ logger }: { logger: ActivityLogger }) {
  const { logs, activity, clearLogs } = logger;
  const [expanded, setExpanded] = useState(false);

  const hasActiveWork = activity.syncing || activity.embeddingModel || activity.llmGenerating;
  const lastLog = logs[logs.length - 1];
  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warning').length;

  function getStatusSummary(): string {
    if (activity.syncing) {
      const prog = activity.syncProgress;
      const pct = prog && prog.total > 0 ? Math.round((prog.current / prog.total) * 100) : 0;
      return `Syncing: ${activity.syncPhase} ${activity.syncCurrentDoc ? `- ${activity.syncCurrentDoc}` : ''} (${prog?.current}/${prog?.total} - ${pct}%)`;
    }
    if (activity.embeddingModel) return 'Loading embedding model...';
    if (activity.llmGenerating) return 'LLM generating response...';
    if (lastLog) return lastLog.message;
    return 'Ready';
  }

  const levelColors: Record<string, string> = {
    info: 'var(--text-dim)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    error: 'var(--danger)',
  };

  return (
    <footer className="status-footer">
      <div className="status-footer-bar" onClick={() => setExpanded(!expanded)}>
        <div className="status-left">
          {hasActiveWork && <span className="status-spinner" />}
          <span className={`status-dot ${hasActiveWork ? 'active' : lastLog?.level === 'error' ? 'error' : 'idle'}`} />
          <span className="status-text">{getStatusSummary()}</span>
        </div>
        <div className="status-right">
          {errorCount > 0 && <span className="status-badge error">{errorCount} error{errorCount > 1 ? 's' : ''}</span>}
          {warnCount > 0 && <span className="status-badge warning">{warnCount} warning{warnCount > 1 ? 's' : ''}</span>}
          <span className="status-badge info">{logs.length} events</span>
          <span className="status-expand">{expanded ? '▼' : '▲'}</span>
        </div>
      </div>

      {activity.syncing && activity.syncProgress && (
        <div className="status-progress">
          <div
            className="status-progress-fill"
            style={{ width: `${activity.syncProgress.total > 0 ? (activity.syncProgress.current / activity.syncProgress.total) * 100 : 0}%` }}
          />
        </div>
      )}

      {expanded && (
        <div className="status-log-panel">
          <div className="status-log-header">
            <span>Activity Log</span>
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={clearLogs}>Clear</button>
          </div>
          <div className="status-log-entries">
            {logs.length === 0 && <div className="status-log-empty">No events yet.</div>}
            {[...logs].reverse().map((entry) => (
              <div key={entry.id} className="status-log-entry">
                <span className="log-time">{entry.timestamp.toLocaleTimeString()}</span>
                <span className="log-source">[{entry.source}]</span>
                <span className="log-message" style={{ color: levelColors[entry.level] }}>{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </footer>
  );
}
