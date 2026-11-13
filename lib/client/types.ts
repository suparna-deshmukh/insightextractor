// Re-exports of the shared server/client types used by the new front-end.
export type {
  SourceId,
  TimeFrame,
  Objective,
  ReportFormat,
  PipelineMode,
  ReportLength,
  ReportTone,
  TimeframeConfig,
  RunRequest as ClientRequest,
  EvidenceRecord,
  Plan,
  Bucket,
  BucketStats,
  SourceStat,
  SqlAuditEntry,
  RunResult,
} from '@/lib/types';
import type { Objective, SourceId, ReportFormat, PipelineMode } from '@/lib/types';

export interface ProviderInfo {
  id: string;
  name: string;
  keyless: boolean;
  keySet: boolean;
  requiresKey?: string;
  fails: number;
  successes: number;
  lastError?: string;
}

export interface SourceInfo {
  id: SourceId;
  label: string;
  icon: string;
  tagline: string;
  keyless: boolean;
  ready: boolean;
  keyHint?: string;
  providers: ProviderInfo[];
}

export interface KeyUsageView {
  name: string;
  used: number;
  quota: number;
  exhausted: boolean;
  remaining: number;
  cooldownUntil?: number | null;
}

export interface UsageView {
  day: string;
  keys: KeyUsageView[];
  totalUsed: number;
  totalQuota: number;
}

export interface RunWindowView {
  ok: boolean;
  used: number;
  limit: number;
  resetsAt: number;
}

export interface HealthView {
  gemini: boolean;
  model: string;
  sources: SourceInfo[];
  usage?: UsageView;
  runWindow?: RunWindowView;
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

export interface StoredRun {
  id: string;
  ts: number;
  request: import('@/lib/types').RunRequest;
  result: import('@/lib/types').RunResult;
}
