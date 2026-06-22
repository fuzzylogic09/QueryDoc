import { useState, useCallback, useRef } from 'react';

export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
  id: number;
  timestamp: Date;
  level: LogLevel;
  message: string;
  source: string;
}

export interface ActivityState {
  syncing: boolean;
  syncPhase: string;
  syncProgress: { current: number; total: number } | null;
  syncCurrentDoc: string;
  embeddingModel: boolean;
  llmGenerating: boolean;
}

let nextId = 0;

export function useActivityLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activity, setActivity] = useState<ActivityState>({
    syncing: false,
    syncPhase: '',
    syncProgress: null,
    syncCurrentDoc: '',
    embeddingModel: false,
    llmGenerating: false,
  });
  const activityRef = useRef(activity);

  const log = useCallback((level: LogLevel, message: string, source: string) => {
    setLogs((prev) => {
      const entry: LogEntry = { id: nextId++, timestamp: new Date(), level, message, source };
      const next = [...prev, entry];
      if (next.length > 200) return next.slice(-200);
      return next;
    });
  }, []);

  const updateActivity = useCallback((partial: Partial<ActivityState>) => {
    setActivity((prev) => {
      const next = { ...prev, ...partial };
      activityRef.current = next;
      return next;
    });
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, activity, log, updateActivity, clearLogs };
}

export type ActivityLogger = ReturnType<typeof useActivityLog>;
