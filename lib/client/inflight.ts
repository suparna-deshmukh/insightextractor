import type { ClientRequest } from './types';

const KEY = 'ie:inflight:v1';
const MAX_AGE_MS = 6 * 3600_000;

export interface InflightRecord {
  token: string;
  request: ClientRequest;
  startedAt: number;
}

export function getInflight(now: number = Date.now()): InflightRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as InflightRecord | null;
    if (!v || typeof v.token !== 'string' || typeof v.startedAt !== 'number' || !v.request || typeof v.request !== 'object') {
      return null;
    }
    if (now - v.startedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function setInflight(record: InflightRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* storage full or unavailable */
  }
}

export function clearInflight(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
