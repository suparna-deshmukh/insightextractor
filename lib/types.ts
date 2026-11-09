export type SourceId =
  | 'hn'
  | 'reddit'
  | 'appstore'
  | 'play'
  | 'github'
  | 'google'
  | 'producthunt'
  | 'youtube';

export interface SourceMeta {
  id: SourceId;
  label: string;
  icon: string;
  tagline: string;
  keyless: boolean;
  keyHint?: string;
}

export interface TimeFrame {
  preset: '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';
  start?: string;
  end?: string;
}

export type Objective =
  | 'problem-discovery'
  | 'product-validation'
  | 'post-launch'
  | 'competitor-teardown'
  | 'feature-prioritization';

export type ReportFormat = 'one-pager' | 'full-report' | 'data-first' | 'exec-brief' | 'raw-data';
export type PipelineMode = 'rapid' | 'deep';
export type ReportLength = 'concise' | 'standard' | 'detailed';
export type ReportTone = 'formal' | 'conversational' | 'neutral';

export interface TimeframeConfig {
  default: TimeFrame;
  overrides: Partial<Record<SourceId, TimeFrame>>;
}

export interface RunRequest {
  topic: string;
  description: string;
  objective: Objective;
  competitors: string[];
  industry: string;
  audience: string;
  keywords: string[];
  focusAreas: string[];
  compareCompetitors: boolean;
  reportLength: ReportLength;
  tone: ReportTone;
  appsHint: string[];
  brandHint: string;
  platforms: SourceId[];
  timeframes: TimeframeConfig;
  format: ReportFormat;
  mode: PipelineMode;
}

export interface EvidenceRecord {
  id: string;
  source: SourceId;
  title: string;
  body: string;
  url: string;
  author: string;
  date: string;
  score: number;
  rating?: number;
}

export interface RedditSpec {
  queries: string[];
  min_records: number;
  checklist: string[];
}

export interface RedditAudit {
  duration_seconds: number;
  records_in: number;
  records_out: number;
  timeframe_respected: boolean;
  min_records_met: boolean;
  queries_covered: boolean;
  all_params_satisfied: boolean;
  gaps: string;
}

export interface Plan {
  keywords: string[];
  queries: Partial<Record<SourceId, string[]>>;
  apps: { name: string; stores: ('appstore' | 'play')[] }[];
  subreddits: string[];
  lookFor: string[];
  hypotheses: string[];
  /** Gemini-authored reddit execution brief (brainless spec). */
  reddit?: RedditSpec;
  /** Grounded context for LLM-driven channels (e.g. the Gemini Reddit channel). */
  problemStatement: string;
  objective: string;
}

export interface Bucket {
  id: number;
  name: string;
  description: string;
  kind: 'pain' | 'praise' | 'feature-request' | 'confusion' | 'comparison' | 'use-case';
}

export interface LabelResult {
  id: string;
  bucket: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevance: 'relevant' | 'irrelevant';
}

export interface SqlAuditEntry {
  stage: string;
  sql: string;
  rows: number;
  summary: string;
}

export interface SourceStat {
  source: SourceId;
  fetched: number;
  kept: number;
  provider?: string;
  warning?: string;
}

export interface BucketStats {
  bucket: Bucket;
  count: number;
  share: number;
  avgScore: number;
  positive: number;
  negative: number;
  neutral: number;
  bySource: { source: SourceId; count: number }[];
  topQuotes: EvidenceRecord[];
}

export interface RunResult {
  topic: string;
  description: string;
  objective: Objective;
  timeframe: TimeFrame;
  plan: Plan;
  totalRecords: number;
  keptRecords: number;
  irrelevantDropped: number;
  perSource: SourceStat[];
  buckets: BucketStats[];
  trend: { date: string; count: number }[];
  labeled: (EvidenceRecord & { bucket: number; sentiment: string })[];
  /** CSV of the raw relevant insights — populated when format === 'raw-data'. */
  rawCsv: string;
  sqlAudit: SqlAuditEntry[];
  report: string;
  model: string;
  usedLlm: boolean;
  durationMs: number;
}

export type AgentEvent =
  | { type: 'stage'; stage: string; index: number; total: number }
  | { type: 'log'; text: string; tone?: 'info' | 'ok' | 'warn' | 'error' }
  | { type: 'source'; source: SourceId; fetched: number; kept: number; warning?: string }
  | { type: 'sql'; stage: string; sql: string; rows: number; summary: string }
  | { type: 'result'; result: RunResult };
