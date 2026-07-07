import { randomUUID } from "crypto";

export interface HistoryEntry {
  id: string;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
  success: boolean;
  label: string;
}

const MAX_ENTRIES = 100;
const history: HistoryEntry[] = [];

export function addHistoryEntry(entry: Omit<HistoryEntry, "id" | "timestamp">): void {
  history.unshift({
    ...entry,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  });
  if (history.length > MAX_ENTRIES) {
    history.splice(MAX_ENTRIES);
  }
}

export function getHistory(): HistoryEntry[] {
  return [...history];
}

export function clearHistory(): void {
  history.splice(0);
}
