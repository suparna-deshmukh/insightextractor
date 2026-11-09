import fs from 'fs';
import path from 'path';
import { RunRequest, RunResult } from './types';
import { ensureDataDir } from './store';

const FILE = path.join(ensureDataDir(), 'runs.json');
const MAX_RUNS_PER_USER = 25;
const MAX_STORED_LABELED = 200;
const MAX_FILE_BYTES = 6_000_000;

export interface StoredRun {
  id: string;
  ts: number;
  request: RunRequest;
  result: RunResult;
}

interface RunStore { runs: Record<string, StoredRun[]> }

function load(): RunStore {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (data && typeof data.runs === 'object') return data;
  } catch {
    /* first run */
  }
  return { runs: {} };
}

function save(store: RunStore) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    let json = JSON.stringify(store);
    // Ephemeral on Vercel, fine on disk locally: if the file balloons, trim oldest runs.
    while (json.length > MAX_FILE_BYTES) {
      let trimmed = false;
      for (const uid of Object.keys(store.runs)) {
        if (store.runs[uid].length > 1) {
          store.runs[uid].pop();
          trimmed = true;
        }
      }
      if (!trimmed) break;
      json = JSON.stringify(store);
    }
    fs.writeFileSync(FILE, json);
  } catch {
    /* best effort */
  }
}

export function saveRun(uid: string, request: RunRequest, result: RunResult): string {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const slim: RunResult = { ...result, labeled: result.labeled.slice(0, MAX_STORED_LABELED) };
  const store = load();
  const list = Array.isArray(store.runs[uid]) ? store.runs[uid] : [];
  list.unshift({ id, ts: Date.now(), request, result: slim });
  store.runs[uid] = list.slice(0, MAX_RUNS_PER_USER);
  save(store);
  return id;
}

export function listRuns(uid: string) {
  const list = load().runs[uid] ?? [];
  return list.map((r) => ({
    id: r.id,
    ts: r.ts,
    topic: r.result.topic,
    objective: r.request.objective,
    platforms: r.request.platforms,
    keptRecords: r.result.keptRecords,
    durationMs: r.result.durationMs,
    format: r.request.format,
    mode: r.request.mode,
  }));
}

export function getRun(uid: string, id: string): StoredRun | null {
  const list = load().runs[uid] ?? [];
  return list.find((r) => r.id === id) ?? null;
}
