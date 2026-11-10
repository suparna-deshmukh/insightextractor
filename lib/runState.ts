import { Bucket, BucketStats, EvidenceRecord, LabelResult, Plan, RedditAudit, RunRequest, RunResult, SourceStat, SqlAuditEntry } from './types';
import { storeGetJson, storeSetJson } from './store';

/**
 * Cross-request checkpoint state for STEP-DRIVEN runs.
 *
 * Vercel (Hobby) suspends long-lived function instances at unpredictable
 * moments, which used to kill a run mid-Gemini-call. The fix: each pipeline
 * stage runs in its own short request, and everything a stage produces is
 * checkpointed here (Redis on Vercel, local files in dev) under the run
 * token. If a request dies, the client re-POSTs the same token and the run
 * continues from the last checkpoint — a dead request costs at most one
 * stage, never the whole run.
 */

export const STAGE_COUNT = 6;
/** `stage === DONE_STAGE` means the run finished (or early-exited). */
export const DONE_STAGE = STAGE_COUNT;

const STATE_TTL_SECONDS = 60 * 60; // a live run moves through all stages in minutes

export interface RunState {
  runId: string;
  /** Wall-clock run start (ms epoch). durationMs includes any resume gaps. */
  ts: number;
  request: RunRequest;
  /** Index of the NEXT stage to run (0..5); 6 = done. */
  stage: number;
  model: string;
  usedLlm: boolean;
  /** Every SQL query audit entry, appended stage by stage. */
  audit: SqlAuditEntry[];
  /** True once the finished run has been written to history (idempotency guard). */
  saved?: boolean;
  // produced by stage 0 (plan)
  plan?: Plan;
  buckets?: Bucket[];
  // produced by stage 1 (fetch)
  perSource?: SourceStat[];
  totalRecords?: number;
  redditAudit?: RedditAudit | null;
  /** Raw fetched records — only needed by stage 2, dropped afterwards. */
  raw?: EvidenceRecord[];
  // produced by stage 2 (clean)
  kept?: EvidenceRecord[];
  keptRecords?: number;
  irrelevant?: number;
  // produced by stage 3 (label)
  labels?: Record<string, LabelResult>;
  // produced by stage 4 (analyze)
  bucketStats?: BucketStats[];
  trend?: { date: string; count: number }[];
  // produced by stage 5 (report)
  labeled?: (EvidenceRecord & { bucket: number; sentiment: string })[];
  report?: string;
  rawCsv?: string;
}

export function stateKey(runId: string): string {
  return `ie:runstate:${runId}`;
}

export function newState(runId: string, request: RunRequest, model: string, usedLlm: boolean): RunState {
  return { runId, ts: Date.now(), request, stage: 0, model, usedLlm, audit: [] };
}

export async function loadState(runId: string): Promise<RunState | null> {
  const s = await storeGetJson<RunState>(stateKey(runId));
  if (!s || typeof s.stage !== 'number' || !s.request || !Array.isArray(s.audit)) return null;
  return s;
}

export async function saveState(s: RunState): Promise<void> {
  await storeSetJson(stateKey(s.runId), s, STATE_TTL_SECONDS);
}

/**
 * Rebuild the final RunResult purely from checkpoint state — deterministic,
 * so a result event lost in transit can be re-delivered verbatim.
 */
export function assembleResult(s: RunState): RunResult {
  const req = s.request;
  return {
    topic: req.topic,
    description: req.description,
    objective: req.objective,
    timeframe: req.timeframes.default,
    plan: s.plan!,
    totalRecords: s.totalRecords ?? 0,
    keptRecords: s.keptRecords ?? s.kept?.length ?? 0,
    irrelevantDropped: s.irrelevant ?? 0,
    perSource: s.perSource ?? [],
    buckets: s.bucketStats ?? [],
    trend: s.trend ?? [],
    labeled: s.labeled ?? [],
    rawCsv: s.rawCsv ?? '',
    sqlAudit: s.audit,
    report: s.report ?? '',
    model: s.model,
    usedLlm: s.usedLlm,
    durationMs: Date.now() - s.ts,
  };
}
