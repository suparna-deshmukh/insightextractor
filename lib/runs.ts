import { RunRequest, RunResult, Objective, SourceId, ReportFormat, PipelineMode } from './types';
import { storeGetJson, storeSetJson } from './store';
import { hashUid } from './usage';

const MAX_RUNS_PER_USER = 25;
const MAX_STORED_LABELED = 200;
const RUN_TTL_SECONDS = 30 * 24 * 3600; // keep run history for 30 days

export interface StoredRun {
  id: string;
  ts: number;
  request: RunRequest;
  result: RunResult;
}

export interface RunSummary {
  id: string;
  ts: number;
  topic: string;
  objective: Objective;
  platforms: SourceId[];
  keptRecords: number;
  durationMs: number;
  format: ReportFormat;
  mode: PipelineMode;
}

function summaryOf(r: StoredRun): RunSummary {
  return {
    id: r.id,
    ts: r.ts,
    topic: r.result.topic,
    objective: r.request.objective,
    platforms: r.request.platforms,
    keptRecords: r.result.keptRecords,
    durationMs: r.result.durationMs,
    format: r.request.format,
    mode: r.request.mode,
  };
}

const listKey = (uid: string) => `ie:runs:${hashUid(uid)}`;
const runKey = (uid: string, id: string) => `ie:run:${hashUid(uid)}:${id}`;

/**
 * Run history in the shared KV store (Redis on Vercel, local JSON files on
 * dev): a small per-user summaries key plus one key per full run. Fail-open —
 * a store error never kills a run (the report is already delivered by then).
 */
export async function saveRun(uid: string, request: RunRequest, result: RunResult): Promise<string> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const slim: RunResult = { ...result, labeled: result.labeled.slice(0, MAX_STORED_LABELED) };
  const stored: StoredRun = { id, ts: Date.now(), request, result: slim };
  try {
    const list = (await storeGetJson<RunSummary[]>(listKey(uid))) ?? [];
    list.unshift(summaryOf(stored));
    await storeSetJson(listKey(uid), list.slice(0, MAX_RUNS_PER_USER), RUN_TTL_SECONDS);
    await storeSetJson(runKey(uid, id), stored, RUN_TTL_SECONDS);
  } catch {
    /* store errors must not kill the run */
  }
  return id;
}

export async function listRuns(uid: string): Promise<RunSummary[]> {
  const list = await storeGetJson<RunSummary[]>(listKey(uid));
  return Array.isArray(list) ? list : [];
}

export async function getRun(uid: string, id: string): Promise<StoredRun | null> {
  const r = await storeGetJson<StoredRun>(runKey(uid, id));
  return r && typeof r.id === 'string' && r.request && r.result ? r : null;
}
