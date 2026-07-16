import { useCallback, useState } from 'react';

const MAX_ENTRIES = 20;

export interface EventLogEntry {
  id: number;
  timestamp: string;
  message: string;
}

let nextId = 0;

/** Keeps the last {@link MAX_ENTRIES} timestamped log lines for the on-screen event log. */
export function useEventLog(): {
  entries: EventLogEntry[];
  log: (message: string) => void;
} {
  const [entries, setEntries] = useState<EventLogEntry[]>([]);

  const log = useCallback((message: string) => {
    const entry: EventLogEntry = {
      id: nextId++,
      timestamp: new Date().toLocaleTimeString(),
      message,
    };
    setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
  }, []);

  return { entries, log };
}
