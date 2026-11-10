import { AgentEvent, Bucket, BucketStats, EvidenceRecord, LabelResult, Plan, RedditAudit, ReportFormat, ReportLength, ReportTone, RunRequest, RunResult, SourceId, SqlAuditEntry, TimeFrame } from './types';
import { SOURCES, fetchPlatform } from './sources';
import type Database from 'better-sqlite3';
import { createDb, insertRecords, runQuery, fetchRows } from './sql';
import { geminiJson, geminiText, hasGeminiKey, geminiConfig, dailyQuota, GeminiAttempt, GeminiStepPendingError } from './gemini';
import { RunState, newState, assembleResult, DONE_STAGE } from './runState';
import { buildFallbackReport, buildRawCsv, buildRawDataReport } from './report';

export const STAGES = ['Understand & plan', 'Fetch platforms', 'Clean & load (SQL)', 'Bucket & label (LLM+SQL)', 'SQL analysis', 'Synthesize report'];

const MAX_KEPT = { rapid: 400, deep: 900 } as const;

/**
 * Gemini call budget per run: exactly 3 LLM calls (all low-reasoning):
 *   1. MASTER PLAN  — queries for every platform + insight buckets + the
 *                     Reddit execution brief, in ONE structured response;
 *   2. LABEL        — the whole kept corpus (up to 400/900 records) is
 *                     bucketed/sentimented/relevance-judged in ONE call
 *                     (safe thanks to the 1M-token context window);
 *   3. REPORT       — final synthesis from SQL aggregates + reddit audit.
 * Every stage degrades to a non-LLM fallback if the budget is exhausted,
 * so a run never fails hard on quota and never fabricates data.
 */
interface StepOpts { oneShot?: boolean }

interface StepCtx {
  state: RunState;
  emit: (e: AgentEvent) => void;
  log: (text: string, tone?: 'info' | 'ok' | 'warn' | 'error') => void;
  attemptLog: (stage: string) => (a: GeminiAttempt) => void;
  stage: (index: number) => void;
  oneShot: boolean;
}

function makeCtx(state: RunState, emit: (e: AgentEvent) => void, oneShot: boolean): StepCtx {
  const log = (text: string, tone: 'info' | 'ok' | 'warn' | 'error' = 'info') => emit({ type: 'log', text, tone });

  /**
   * Every Gemini request that counts against the shared budget is explained
   * in the console — so the lines on the left ALWAYS reconcile with the
   * shared-calls counter in the top bar.
   */
  const attemptLog = (stage: string) => (a: GeminiAttempt) => {
    if (a.outcome === 'ok') {
      log(`${stage} ✓ ${a.model} via ${a.key} (1 shared call used)`);
    } else if (a.outcome === 'quota') {
      log(`${stage} ✗ ${a.key} hit its daily limit — recorded ${dailyQuota()}/${dailyQuota()} (fully utilized) and refused until Pacific midnight; switching key. No further query was sent to it.`, 'error');
    } else if (a.outcome === 'error') {
      log(`${stage} ⚠ ${a.model} via ${a.key} failed — ${a.detail ?? ''} (this request counted against the shared budget)`, 'warn');
    } else {
      log(`${stage} ⚠ ${a.model} unavailable — trying the next model on the same key`, 'warn');
    }
  };

  const stage = (index: number) => {
    emit({ type: 'stage', stage: STAGES[index], index, total: STAGES.length });
    log(`— ${STAGES[index]} —`);
  };

  return { state, emit, log, attemptLog, stage, oneShot };
}

/**
 * Runs ONE pipeline stage against checkpoint state (see lib/runState.ts).
 *
 * On success, `state.stage` points at the next stage (or DONE_STAGE) and the
 * caller persists the state and notifies the client. Returns the final
 * RunResult when the run completed inside this step (the report stage, or the
 * clean stage's empty-corpus early exit); otherwise null.
 *
 * Throws GeminiStepPendingError (oneShot mode) when a Gemini attempt failed or
 * stalled: state is left UNCHANGED, so the next request for the same run token
 * re-runs this same stage — now that the failed model/key is in cooldown.
 */
export async function runStep(state: RunState, emit: (e: AgentEvent) => void, opts: StepOpts = {}): Promise<RunResult | null> {
  const ctx = makeCtx(state, emit, Boolean(opts.oneShot));
  switch (state.stage) {
    case 0: await stepPlan(ctx); break;
    case 1: await stepFetch(ctx); break;
    case 2: { const early = await stepClean(ctx); if (early) return early; break; }
    case 3: await stepLabel(ctx); break;
    case 4: await stepAnalyze(ctx); break;
    case 5: return await stepReport(ctx);
    default: return assembleResult(state); // already finished — re-deliver
  }
  return null;
}

/**
 * Legacy one-shot entry point (local dev / old stream route): runs all six
 * stages in a single request, no checkpointing. Behaviour is unchanged.
 */
export async function runPipeline(req: RunRequest, emit: (e: AgentEvent) => void): Promise<RunResult> {
  const usedLlm = hasGeminiKey();
  const state = newState('inline', req, usedLlm ? geminiConfig().model : 'heuristic-fallback', usedLlm);
  for (;;) {
    const result = await runStep(state, emit);
    if (result) return result;
    if (state.stage >= DONE_STAGE) return assembleResult(state);
  }
}

// ---------- STAGE 1: MASTER PLAN (Gemini call 1/3) ----------
async function stepPlan(ctx: StepCtx): Promise<void> {
  const { state, log, attemptLog, stage, oneShot } = ctx;
  const req = state.request;
  stage(0);
  let plan: Plan;
  let buckets: Bucket[];
  if (state.usedLlm) {
    log('Gemini call 1/3 — master plan: platform queries + insight buckets + Reddit brief…');
    try {
      const master = await geminiJson(masterPlanSystem(req), masterPlanUser(req), 4096, 0.2, attemptLog('Gemini 1/3 · master plan'), oneShot);
      plan = normalizePlan(master, req);
      buckets = parseBuckets(master, req.mode);
      if (!buckets.length) buckets = heuristicBuckets();
    } catch (err) {
      if (err instanceof GeminiStepPendingError) throw err;
      log(`Master plan failed (${(err as Error).message.slice(0, 140)}) — heuristic plan, saving Gemini budget.`, 'warn');
      plan = heuristicPlan(req);
      buckets = heuristicBuckets();
    }
  } else {
    log('No Gemini key — heuristic planning (set GEMINI_API_KEY for full mode).', 'warn');
    plan = heuristicPlan(req);
    buckets = heuristicBuckets();
  }
  log(`Keywords: ${plan.keywords.join(' · ')}`, 'ok');
  if (plan.apps.length) log(`Apps to mine for reviews: ${plan.apps.map((a) => a.name).join(', ')}`);
  if (plan.subreddits.length) log(`Subreddits: ${plan.subreddits.join(', ')}`);
  log(`Buckets: ${buckets.map((b) => `${b.id}:${b.name}`).join('  ')}`);
  log(`Hypotheses: ${plan.hypotheses.slice(0, 2).join(' | ')}`);
  state.plan = plan;
  state.buckets = buckets;
  state.stage = 1;
}

// ---------- STAGE 2: FETCH (no LLM) ----------
async function stepFetch(ctx: StepCtx): Promise<void> {
  const { state, emit, log, stage } = ctx;
  const req = state.request;
  const plan = state.plan!;
  stage(1);
  const selected = req.platforms.filter((p) => SOURCES[p]);
  const perSource = selected.map((s) => ({ source: s, fetched: 0, kept: 0 } as { source: SourceId; fetched: number; kept: number; provider?: string; warning?: string }));
  log(`Fanning out to ${selected.length} platforms in parallel (each with its own API fallback ladder)…`);
  const tfFor = (s: SourceId) => req.timeframes.overrides[s] ?? req.timeframes.default;
  const settled = await Promise.allSettled(selected.map((s) =>
    fetchPlatform(s, plan, tfFor(s), req.mode, (text, tone) => emit({ type: 'log', text, tone: tone ?? 'info' }))
  ));
  const allRecords: EvidenceRecord[] = [];
  let redditAudit: RedditAudit | null = null;
  settled.forEach((res, i) => {
    const stat = perSource[i];
    if (res.status === 'fulfilled') {
      const pf = res.value;
      stat.fetched = pf.records.length;
      stat.provider = pf.provider ?? undefined;
      stat.warning = pf.warning;
      if (pf.audit && stat.source === 'reddit') redditAudit = pf.audit;
      allRecords.push(...pf.records);
      if (pf.provider) {
        log(`${SOURCES[stat.source].meta.label}: ${pf.records.length} records via ${pf.provider}`, pf.records.length ? 'ok' : 'warn');
      } else {
        log(`${SOURCES[stat.source].meta.label}: all providers failed — ${pf.warning}`, 'error');
      }
    } else {
      const msg = res.reason?.message ?? String(res.reason);
      stat.warning = msg;
      log(`${SOURCES[stat.source].meta.label}: failed — ${msg}`, 'error');
    }
    emit({ type: 'source', source: stat.source, fetched: stat.fetched, kept: stat.fetched, warning: stat.warning });
  });
  log(`Total raw records: ${allRecords.length}`, allRecords.length ? 'ok' : 'warn');
  state.perSource = perSource;
  state.totalRecords = allRecords.length;
  state.redditAudit = redditAudit;
  state.raw = allRecords;
  state.stage = 2;
}

// ---------- STAGE 3: CLEAN & LOAD (SQL, no LLM) ----------
async function stepClean(ctx: StepCtx): Promise<RunResult | null> {
  const { state, emit, log, stage } = ctx;
  const req = state.request;
  const plan = state.plan!;
  stage(2);
  const all = state.raw ?? [];
  state.raw = undefined; // only this stage needs the raw corpus
  const db = createDb();
  const relevance = relevanceFilter(all, plan, req);
  log(`Relevance pre-filter: kept ${relevance.kept.length} / ${relevance.all.length} records (dropped ${relevance.all.length - relevance.kept.length} off-topic)`, relevance.all.length - relevance.kept.length ? 'warn' : 'ok');
  const kept = relevance.kept.slice(0, MAX_KEPT[req.mode]);
  insertRecords(db, kept);
  runQuery(db, state.audit, 'clean', 'SELECT COUNT(*) AS n FROM records', (r) => `${r[0].n} records loaded into SQLite (in-memory)`);
  const perSourceKept = runQuery(db, state.audit, 'clean', 'SELECT source, COUNT(*) AS n FROM records GROUP BY source ORDER BY n DESC', (r) => r.map((x) => `${x.source}:${x.n}`).join(' '));
  for (const stat of state.perSource ?? []) stat.kept = perSourceKept.find((x) => x.source === stat.source)?.n ?? 0;
  if (kept.length < all.length) log(`Truncated to ${kept.length} records (mode=${req.mode})`, 'info');
  state.kept = kept;
  state.keptRecords = kept.length;

  if (!kept.length) {
    const report = cleanReport(buildFallbackReport(req, plan, [], 'No records could be fetched from the selected platforms in this window. Widen the timeframe or add more platforms, then re-run.'));
    state.report = report;
    state.buckets = [];
    state.trend = [];
    state.labeled = [];
    state.rawCsv = '';
    state.irrelevant = all.length;
    state.stage = DONE_STAGE;
    const early = assembleResult(state);
    emit({ type: 'result', result: early });
    return early;
  }

  state.stage = 3;
  return null;
}

// ---------- STAGE 4: BUCKET & LABEL (Gemini call 2/3 — whole corpus, one call) ----------
async function stepLabel(ctx: StepCtx): Promise<void> {
  const { state, log, attemptLog, stage, oneShot } = ctx;
  const req = state.request;
  const plan = state.plan!;
  const buckets = state.buckets!;
  stage(3);
  const db = createDb();
  insertRecords(db, state.kept ?? []);
  let labels: Map<string, LabelResult>;
  if (state.usedLlm) {
    log(`Gemini call 2/3 — labeling all ${Math.min((state.kept ?? []).length, MAX_KEPT[req.mode])} records in a single pass…`);
    try {
      labels = await labelCorpus(db, state.audit, buckets, plan, req, log, attemptLog('Gemini 2/3 · label corpus'), oneShot);
    } catch (err) {
      if (err instanceof GeminiStepPendingError) throw err;
      log(`LLM labeling failed (${(err as Error).message.slice(0, 140)}) — rule-based labels, saving Gemini budget.`, 'warn');
      labels = heuristicLabels(db, buckets);
    }
  } else {
    labels = heuristicLabels(db, buckets);
    log('Heuristic bucketing (no LLM): rule-based assignment.', 'warn');
  }
  applyLabels(db, labels);
  const relCounts = runQuery(db, state.audit, 'bucket', "SELECT relevance, COUNT(*) AS n FROM records GROUP BY relevance", (r) => r.map((x) => `${x.relevance}:${x.n}`).join(' '));
  const irrelevant = (relCounts.find((x) => x.relevance === 'irrelevant') as any)?.n ?? 0;
  runQuery(db, state.audit, 'bucket', "SELECT COUNT(*) AS n FROM records WHERE bucket IS NOT NULL AND relevance='relevant'", (r) => `${r[0].n} relevant records bucketed`);
  log(`Relevance check: ${irrelevant} records marked irrelevant → excluded from insights`, irrelevant ? 'warn' : 'ok');
  state.labels = Object.fromEntries(labels);
  state.irrelevant = irrelevant;
  state.stage = 4;
}

// ---------- STAGE 5: SQL ANALYSIS (no LLM) ----------
async function stepAnalyze(ctx: StepCtx): Promise<void> {
  const { state, log, stage } = ctx;
  const buckets = state.buckets!;
  stage(4);
  const db = createDb();
  insertRecords(db, state.kept ?? []);
  if (state.labels) applyLabels(db, new Map(Object.entries(state.labels)));
  const bucketStats: BucketStats[] = buckets.map((b) => {
    const agg = runQuery(db, state.audit, 'analyze',
      `SELECT COUNT(*) AS n, ROUND(AVG(score),1) AS avg_score,
         SUM(CASE WHEN sentiment='positive' THEN 1 ELSE 0 END) AS pos,
         SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS neg,
         SUM(CASE WHEN sentiment='neutral' THEN 1 ELSE 0 END) AS neu
       FROM records WHERE bucket=${b.id} AND relevance='relevant'`, (r) => `bucket ${b.id} (${b.name}): n=${r[0]?.n ?? 0}`)[0];
    const bySrc = fetchRows(db, "SELECT source, COUNT(*) AS n FROM records WHERE bucket=? AND relevance='relevant' GROUP BY source ORDER BY n DESC", b.id) as any[];
    const quotes = fetchRows(db, "SELECT * FROM records WHERE bucket=? AND relevance='relevant' ORDER BY score DESC, length(body) DESC LIMIT 3", b.id) as any[];
    return {
      bucket: b,
      count: agg?.n ?? 0,
      share: 0,
      avgScore: agg?.avg_score ?? 0,
      positive: agg?.pos ?? 0, negative: agg?.neg ?? 0, neutral: agg?.neu ?? 0,
      bySource: bySrc.map((x) => ({ source: x.source as SourceId, count: x.n })),
      topQuotes: quotes.map(rowToRecord),
    };
  });
  const total = state.kept?.length ?? 0;
  for (const b of bucketStats) b.share = total ? Math.round((b.count / total) * 1000) / 10 : 0;
  bucketStats.sort((a, b) => b.count - a.count);

  const trend = runQuery(db, state.audit, 'analyze', "SELECT date, COUNT(*) AS n FROM records WHERE date != '' GROUP BY date ORDER BY date", (r) => `${r.length} active days`);
  runQuery(db, state.audit, 'analyze', "SELECT source, ROUND(AVG(score),1) AS avg, COUNT(*) AS n FROM records GROUP BY source ORDER BY n DESC", (r) => r.map((x) => `${x.source} avg=${x.avg}`).join(' '));
  log(`SQL analysis complete — ${state.audit.length} queries audited.`, 'ok');
  state.bucketStats = bucketStats;
  state.trend = (trend as any[]).map((t) => ({ date: t.date, count: t.n }));
  state.stage = 5;
}

// ---------- STAGE 6: SYNTHESIZE (Gemini call 3/3 — skipped for Raw Data) ----------
async function stepReport(ctx: StepCtx): Promise<RunResult> {
  const { state, log, attemptLog, stage, oneShot } = ctx;
  const req = state.request;
  const plan = state.plan!;
  const buckets = state.buckets ?? [];
  const bucketStats = state.bucketStats ?? [];
  const trend = state.trend ?? [];
  stage(5);
  const db = createDb();
  insertRecords(db, state.kept ?? []);
  if (state.labels) applyLabels(db, new Map(Object.entries(state.labels)));
  let report: string;
  let rawCsv = '';
  if (req.format === 'raw-data') {
    const rel = (fetchRows(db, "SELECT * FROM records WHERE relevance='relevant' ORDER BY bucket, score DESC") as any[]).map((r) => ({ ...rowToRecord(r), bucket: Number(r.bucket), sentiment: r.sentiment ?? 'neutral' }));
    rawCsv = buildRawCsv(rel, (id) => buckets.find((b) => b.id === id)?.name ?? `#${id}`);
    report = buildRawDataReport(req, plan, rel.length, state.kept?.length ?? 0, state.totalRecords ?? 0, state.redditAudit ?? null);
    log(`Raw Data output: CSV with ${rel.length} relevant insights — report synthesis call skipped (run used 2 of the 3-call budget).`, 'ok');
  } else if (state.usedLlm) {
    log('Gemini call 3/3 — synthesizing the final User Insights report…');
    try {
      report = await synthesizeReport(req, plan, bucketStats, trend as any[], state.model, state.redditAudit ?? null, attemptLog('Gemini 3/3 · report'), oneShot);
    } catch (err) {
      if (err instanceof GeminiStepPendingError) throw err;
      log(`Report synthesis failed (${(err as Error).message.slice(0, 140)}) — template report, saving Gemini budget.`, 'warn');
      report = cleanReport(buildFallbackReport(req, plan, bucketStats, 'LLM report synthesis unavailable in this run (quota); this is the deterministic template. Re-run when quota is available.'));
    }
  } else {
    report = cleanReport(buildFallbackReport(req, plan, bucketStats, undefined));
  }
  log('Report ready.', 'ok');

  const labeled = fetchRows(db, 'SELECT * FROM records WHERE bucket IS NOT NULL ORDER BY relevance DESC, score DESC').map((r) => ({ ...rowToRecord(r), bucket: r.bucket, sentiment: r.sentiment ?? 'neutral', relevance: r.relevance ?? 'relevant' })).slice(0, 500);
  state.report = report;
  state.rawCsv = rawCsv;
  state.labeled = labeled;
  state.stage = DONE_STAGE;
  return assembleResult(state);
}

// ---------------- master plan (Gemini call 1/3) ----------------

function masterPlanSystem(req: RunRequest): string {
  const nBuckets = req.mode === 'rapid' ? 4 : 6;
  const redditPart = req.platforms.includes('reddit')
    ? ` (9) "reddit" is REQUIRED (reddit is selected): an execution brief for a MECHANICAL reddit collection worker — it will run exactly what you specify and nothing else. {"queries": ${req.mode === 'rapid' ? '2' : '3'} reddit search strings, each 2-6 words, built ONLY from brief facts (use "site:reddit.com r/<sub> <terms>" ONLY when that subreddit is explicitly named in the brief), "min_records": ${req.mode === 'rapid' ? 30 : 60}, "checklist": 3-5 short parameter statements the worker must satisfy (timeframe, minimum records, which communities/topics, what to capture)}.`
    : ` (9) "reddit" must be [] (reddit is NOT selected).`;
  return `You are the query-planning module of a user-research extractor. Convert the research brief into ONE complete execution plan. ANTI-HALLUCINATION RULES (strict): (1) Use ONLY facts present in the brief. Never invent products, companies, app names, subreddits, features, or claims. (2) "apps": EVERY competitor named in the brief MUST appear in apps with stores ["appstore","play"]. You may add other apps ONLY if explicitly named in the description. If nothing is named, []. (3) "subreddits": ONLY subreddit names explicitly written in the brief, else []. (4) "keywords": 3-5 short (2-5 word) phrases taken from or paraphrasing the topic/description; one phrase must capture the core problem as stated. No speculative words. (5) "queries": for EACH selected platform below (EXCLUDE reddit — it is planned separately), 1-2 short (2-5 word) search phrases natural for that platform, reusing the keywords, never adding new concepts. (6) "lookFor": at most 5 items, copied near-verbatim from what the brief says to look for; if the brief specifies nothing, exactly ["complaints","praise","feature requests"]. (7) "hypotheses": 2-4 checkable statements derived ONLY from explicit claims in the brief. (8) "buckets": exactly ${nBuckets} mutually exclusive insight buckets a product manager needs for this objective: each {"id":${nBuckets >= 6 ? '1..6' : '1..4'},"name":"max 6 words","description":"one line of what belongs here","kind":"pain|praise|feature-request|confusion|comparison|use-case"}. Derive them ONLY from the objective, focus areas and problem statement — not from imagined data.${redditPart} Output STRICT JSON only, no markdown fences, no commentary, matching: {"keywords":[],"queries":{},"apps":[],"subreddits":[],"lookFor":[],"hypotheses":[],"buckets":[],"reddit":{"queries":[],"min_records":0,"checklist":[]}}`;
}

function masterPlanUser(req: RunRequest): string {
  return `TOPIC: ${req.topic}
DETAILED DESCRIPTION: ${req.description}
OBJECTIVE: ${req.objective}
COMPETITORS NAMED: ${req.competitors.join(', ') || '(none)'}
INDUSTRY: ${req.industry || '(not specified)'}
TARGET AUDIENCE: ${req.audience || '(not specified)'}
USER-PROVIDED KEYWORDS: ${req.keywords.join(', ') || '(none)'}
FOCUS AREAS: ${req.focusAreas.join(', ') || '(none)'}
BRAND/PRODUCT LINE: ${req.brandHint || '(none)'}
APP NAMES NAMED: ${req.appsHint.join(', ') || '(none)'}
TIMEFRAME: ${describeTf(req.timeframes.default)}
PLATFORMS SELECTED: ${req.platforms.join(', ')}

Remember: only include apps/subreddits explicitly named above. When in doubt, omit.`;
}

function parseBuckets(master: any, mode: RunRequest['mode']): Bucket[] {
  const n = mode === 'rapid' ? 4 : 6;
  const kinds = ['pain', 'praise', 'feature-request', 'confusion', 'comparison', 'use-case'];
  const arr: any[] = Array.isArray(master?.buckets) ? master.buckets : [];
  return arr.filter((b) => b && typeof b.name === 'string' && String(b.name).trim())
    .slice(0, n)
    .map((b, i) => ({
      id: i + 1,
      name: String(b.name).trim().slice(0, 60),
      description: String(b.description ?? '').slice(0, 160),
      kind: kinds.includes(b.kind) ? b.kind : 'use-case',
    }));
}

// ---------------- labeling (Gemini call 2/3 — the whole corpus in ONE call) ----------------

async function labelCorpus(db: Database.Database, audit: SqlAuditEntry[], buckets: Bucket[], plan: Plan, req: RunRequest, log: (t: string, t2?: any) => void, onAttempt: (a: GeminiAttempt) => void, oneShot = false): Promise<Map<string, LabelResult>> {
  const out = new Map<string, LabelResult>();
  const all: any[] = fetchRows(db, 'SELECT id, substr(title,1,120) AS title, substr(body,1,200) AS body, source FROM records');
  const cap = MAX_KEPT[req.mode];
  const rows = all.slice(0, cap);
  const bucketList = buckets.map((b) => `${b.id}=${b.name} (${b.description})`).join('; ');
  const data = await geminiJson(
    'You are a labeling module. For EACH numbered record decide: (a) relevance — "relevant" only if the record is directly about the topic/problem space (a complaint, praise, feature ask, comparison or use-case for it); mark "irrelevant" for off-topic, unrelated products, or incidental mentions. When plausibly related, prefer "relevant". (b) its bucket id — choose exactly one of the listed buckets. (c) sentiment. Output STRICT JSON: {"labels":[{"id":"<record id>","bucket":<int>,"sentiment":"positive|negative|neutral","relevance":"relevant|irrelevant"}]}. Every record id must appear exactly once. No markdown fences.',
    `Buckets: ${bucketList}\nTopic: ${req.topic}\nWhat we are looking for: ${plan.lookFor.join('; ')}\nRecords (${rows.length}):\n${rows.map((r) => `${r.id} | ${r.source} | ${r.title} | ${r.body}`).join('\n')}`,
    req.mode === 'rapid' ? 24576 : 32768,
    0.1,
    onAttempt,
    oneShot
  );
  const arr: any[] = Array.isArray(data) ? data : data.labels;
  for (const l of arr) {
    if (l && typeof l.id === 'string' && rows.some((r) => r.id === l.id) && buckets.some((b) => b.id === Number(l.bucket))) {
      out.set(l.id, { id: l.id, bucket: Number(l.bucket), sentiment: ['positive', 'negative', 'neutral'].includes(l.sentiment) ? l.sentiment : 'neutral', relevance: l.relevance === 'irrelevant' ? 'irrelevant' : 'relevant' });
    }
  }
  runQuery(db, audit, 'bucket', `SELECT COUNT(*) AS n FROM records`, (r) => `single-pass LLM labeling: ${out.size}/${rows.length} records labeled`);
  log(`Labeling pass: ${out.size}/${rows.length} records labeled (1 call)`, 'ok');
  for (const r of rows) if (!out.has(r.id)) out.set(r.id, { id: r.id, bucket: buckets[0].id, sentiment: 'neutral', relevance: 'relevant' });
  return out;
}

function applyLabels(db: Database.Database, labels: Map<string, LabelResult>): void {
  const stmt = db.prepare('UPDATE records SET bucket=?, sentiment=?, relevance=? WHERE id=?');
  const tx = db.transaction(() => {
    for (const l of labels.values()) stmt.run(l.bucket, l.sentiment, l.relevance, l.id);
  });
  tx();
}

// ---------------- report synthesis (Gemini call 3/3) ----------------

async function synthesizeReport(req: RunRequest, plan: Plan, bucketStats: BucketStats[], trend: any[], model: string, redditAudit: RedditAudit | null, onAttempt: (a: GeminiAttempt) => void, oneShot = false): Promise<string> {
  const ctx = {
    topic: req.topic,
    description: req.description,
    objective: req.objective,
    industry: req.industry || null,
    audience: req.audience || null,
    focusAreas: req.focusAreas.length ? req.focusAreas : null,
    compareCompetitors: req.compareCompetitors,
    competitors: req.competitors,
    timeframe: describeTf(req.timeframes.default),
    hypotheses: plan.hypotheses,
    totals: { records: bucketStats.reduce((s, b) => s + b.count, 0) },
    redditAudit,
    relevance: { note: 'Records were pre-filtered lexically and LLM-judged for relevance; irrelevant records are excluded from all sections.' },
    buckets: bucketStats.map((b) => ({
      name: b.bucket.name, kind: b.bucket.kind, count: b.count, share: b.share, avgScore: b.avgScore,
      positive: b.positive, negative: b.negative, neutral: b.neutral,
      topPlatforms: b.bySource.slice(0, 3).map((x) => `${x.source}(${x.count})`),
      quotes: b.topQuotes.slice(0, 2).map((q) => `[${q.source} ${q.date}] ${q.title} :: ${q.body.slice(0, 240)}`),
    })),
    trend: trend.slice(-14),
  };
  const fmtNote =
    req.format === 'one-pager'
      ? 'Use sections 1-9 exactly as specified. Keep it crisp: a PM should finish reading in 4 minutes.'
      : req.format === 'full-report'
        ? 'Use sections 1-9 plus section 10 "HYPOTHESIS CHECKS" (verdict per hypothesis: supported/contradicted/inconclusive + evidence), 11 "COMPETITOR MENTIONS" (who is named, in what framing), 12 "METHODOLOGY & LIMITATIONS". Be thorough.'
        : req.format === 'exec-brief'
          ? 'Use ONLY: title, "KEY FINDINGS" (3-5 bullets, each with evidence count), "WHAT THIS MEANS FOR US" (2-3 sentences), "TOP 3 RECOMMENDATIONS" (P1/P2/P3), and a one-line DATA NOTE (records, platforms, timeframe, reddit audit if present). Nothing else. A VP should finish it in 90 seconds.'
          : 'Use sections 1-3, 8 and 9 only. Lead with numbers; keep prose minimal. The exports (JSON/CSV) are the primary artifact.';
  const lenNote =
    req.reportLength === 'concise'
      ? 'LENGTH: concise — cut every section ~40%: max 3 bullets per section, max 3 recommendations, one quote per bucket.'
      : req.reportLength === 'detailed'
        ? 'LENGTH: detailed — expand: up to 6 bullets per section, 5 recommendations, 2-3 quotes per top bucket, richer trend and methodology detail.'
        : 'LENGTH: standard.';
  const toneNote =
    req.tone === 'formal'
      ? 'TONE: formal, executive, zero filler, no contractions.'
      : req.tone === 'conversational'
        ? 'TONE: conversational, plain-spoken, contractions fine, still data-first.'
        : 'TONE: neutral professional.';
  const cmpNote = req.compareCompetitors && req.competitors.length
    ? `COMPETITOR COMPARISON: the brief asks for a competitor read. Insert a "COMPETITOR COMPARISON" section after section 4: for each competitor named (${req.competitors.join(', ')}), how it is framed in the evidence (praised / complained about / compared-against) with record counts and one quote each. Use ONLY evidence actually present; if a competitor has no evidence, say so explicitly.`
    : '';
  const redditNote = redditAudit
    ? `REDDIT CHANNEL AUDIT (filed by the channel, treat as fact): ${JSON.stringify(redditAudit)}. If min-records or query coverage was NOT met, say so in the DATA NOTE — do not present partial reddit signal as complete.`
    : '';
  const report = await geminiText(
    'You are a senior product analyst writing a "User Insights Report" for a product manager. Use ONLY the evidence provided. Be specific, cite bucket names and record counts. No filler, no generic advice. Output raw markdown only.',
    `Produce the USER INSIGHTS REPORT for "${req.topic}".\n${fmtNote}\n${lenNote}\n${toneNote}\n${cmpNote}\n${redditNote}\n\nEVIDENCE (JSON):\n${JSON.stringify(ctx, null, 1)}\n\nREQUIRED STRUCTURE (markdown, section numbers as given):\n# USER INSIGHTS REPORT — ${req.topic.toUpperCase()}\n## 1. SNAPSHOT (bullets: records analyzed, platforms, timeframe, objective, industry and audience if given, signal strength = strong >=300 / moderate >=80 / thin <80)\n## 2. TOP INSIGHT BUCKETS (markdown table: Bucket | n | Share | Avg score | Sentiment mix | Strongest platforms)\n## 3. WHAT USERS LOVE (bullets, each citing count)\n## 4. WHAT USERS HATE (bullets ordered by severity, each citing count)\n## 5. UNMET NEEDS & FEATURE REQUESTS (bullets, ranked by frequency)\n## 6. VOICE OF THE USER (for the top 3 buckets, 1-2 short verbatim quotes with [platform, date] attribution)\n## 7. MOMENTUM & TRENDS (weekly direction from trend data; if thin, say so)\n## 8. RECOMMENDATIONS (3-5, format: **P1/P2/P3 — action** — rationale (evidence: bucket, n records))\n## 9. METHOD & DATA APPENDIX (sources + API providers used, relevance filtering approach, bucketing approach = LLM-defined buckets + SQL aggregation, limitations)\n\nJSON context:\n`,
    req.reportLength === 'concise' ? 4096 : req.reportLength === 'detailed' ? 12288 : 8192,
    0.35,
    onAttempt,
    oneShot
  );
  return cleanReport(report);
}

// ---------------- report formatting sanitizer ----------------
/**
 * Guarantees well-formed report output no matter what the model emits:
 * strips an outer code fence, normalizes line endings and trailing spaces,
 * collapses blank-line runs, and drops stray leading whitespace.
 */
function cleanReport(raw: string): string {
  let t = (raw ?? '').trim();
  const fence = t.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n?```\s*$/);
  if (fence) t = fence[1].trim();
  t = t.replace(/\r\n/g, '\n');
  t = t.replace(/^[\s\uFEFF]+/, '');
  t = t.replace(/[ \t]+$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n');
  // a report must open with a markdown H1
  if (!t.startsWith('# ')) t = `# USER INSIGHTS REPORT\n\n${t}`;
  return t.trim() + '\n';
}

// ---------------- deterministic helpers (no LLM) ----------------

const STOPWORDS = new Set(['the','and','for','with','that','this','from','have','has','are','was','were','been','being','will','would','can','could','should','about','into','over','under','your','you','our','their','them','they','what','when','where','which','who','how','why','not','but','all','any','some','one','two','app','apps','tool','tools','using','use','used','like','get','got','its']);

function relevanceTokens(plan: Plan, req: RunRequest): { tokens: Set<string>; phrases: string[] } {
  const tokens = new Set<string>();
  const push = (str: string, minLen: number) => {
    for (const w of str.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= minLen && !STOPWORDS.has(w)) tokens.add(w);
    }
  };
  push(req.topic, 2);
  for (const k of plan.keywords) push(k, 3);
  for (const c of req.competitors) push(c, 3);
  const phrases = [...plan.keywords, ...req.competitors, req.topic].filter(Boolean).map((x) => x.toLowerCase());
  return { tokens, phrases };
}

function relevanceFilter(all: EvidenceRecord[], plan: Plan, req: RunRequest): { kept: EvidenceRecord[]; all: EvidenceRecord[] } {
  const { tokens, phrases } = relevanceTokens(plan, req);
  const kept = all.filter((r) => {
    if (r.source === 'google' || r.source === 'appstore' || r.source === 'play') return true;
    const text = `${r.title} ${r.body}`.toLowerCase();
    if (phrases.some((p) => text.includes(p))) return true;
    for (const t of tokens) if (text.includes(t)) return true;
    return false;
  });
  return { kept, all };
}

function rowToRecord(r: any): EvidenceRecord {
  return { id: r.id, source: r.source, title: r.title, body: r.body, url: r.url, author: r.author, date: r.date, score: r.score, rating: r.rating ?? undefined };
}

function describeTf(tf: TimeFrame): string {
  if (tf.preset === 'all') return 'all time';
  if (tf.preset === 'custom') return `${tf.start} → ${tf.end}`;
  return `last ${tf.preset}`;
}

function normalizePlan(p: any, req: RunRequest): Plan {
  const apps: { name: string; stores: ('appstore' | 'play')[] }[] = [];
  const addApp = (name: string) => {
    const n = (name ?? '').trim();
    if (!n || apps.some((a) => a.name.toLowerCase() === n.toLowerCase())) return;
    apps.push({ name: n, stores: ['appstore', 'play'] });
  };
  for (const c of req.competitors) addApp(c);
  if (Array.isArray(p.apps)) {
    for (const a of p.apps) if (a && typeof a.name === 'string') addApp(a.name);
  }
  for (const a of req.appsHint) addApp(a);
  if (req.brandHint) addApp(req.brandHint);
  const kws0 = (Array.isArray(p.keywords) ? p.keywords : []).filter((x: any) => typeof x === 'string').slice(0, 5) as string[];
  const mergedKws: string[] = [];
  for (const k of [...req.keywords, ...kws0, ...(req.brandHint ? [req.brandHint] : [])]) {
    if (k && !mergedKws.some((x) => x.toLowerCase() === k.toLowerCase())) mergedKws.push(k);
  }
  const kws = mergedKws.slice(0, 6);
  const lookFor = (Array.isArray(p.lookFor) ? p.lookFor : []).filter((x: any) => typeof x === 'string').slice(0, 5) as string[];
  if (req.compareCompetitors && !lookFor.some((x) => /competitor/i.test(x))) lookFor.push('competitor comparisons');
  for (const f of req.focusAreas) if (!lookFor.some((x) => x.toLowerCase() === f.toLowerCase())) lookFor.push(f);
  const subreddits = (Array.isArray(p.subreddits) ? p.subreddits : []).filter((x: any) => typeof x === 'string').slice(0, 2);
  const reddit = p.reddit && Array.isArray(p.reddit.queries) && p.reddit.queries.length
    ? {
        queries: p.reddit.queries.filter((x: any) => typeof x === 'string' && x.trim()).slice(0, req.mode === 'rapid' ? 3 : 4),
        min_records: Math.min(120, Math.max(10, Number(p.reddit.min_records) || (req.mode === 'rapid' ? 30 : 60))),
        checklist: (Array.isArray(p.reddit.checklist) ? p.reddit.checklist : []).filter((x: any) => typeof x === 'string').slice(0, 5),
      }
    : undefined;
  return {
    keywords: kws.length ? kws : [req.topic],
    problemStatement: req.description.slice(0, 1200),
    objective: req.objective,
    queries: p.queries && typeof p.queries === 'object' ? p.queries : {},
    apps: apps.slice(0, 4),
    subreddits,
    lookFor: lookFor.slice(0, 7),
    hypotheses: (Array.isArray(p.hypotheses) ? p.hypotheses : []).filter((x: any) => typeof x === 'string').slice(0, 4),
    reddit,
  };
}

function heuristicPlan(req: RunRequest): Plan {
  const kw = req.topic.trim().split(/\s+/).slice(0, 4).join(' ');
  const kws = [...req.keywords, kw, `${kw} review`, `${kw} problems`, `${kw} alternative`, ...(req.brandHint ? [req.brandHint] : [])].filter(Boolean).slice(0, 6);
  return {
    keywords: kws,
    queries: {},
    apps: [...req.competitors.slice(0, 2), ...req.appsHint.slice(0, 2)].map((c) => ({ name: c, stores: ['appstore', 'play'] as ('appstore' | 'play')[] })),
    subreddits: [],
    lookFor: ['pain points', 'praise', 'feature requests'],
    hypotheses: ['users have unmet needs around ' + req.topic],
    problemStatement: req.description.slice(0, 1200),
    objective: req.objective,
  };
}

function heuristicBuckets(): Bucket[] {
  return [
    { id: 1, name: 'Pain points & complaints', kind: 'pain', description: 'Negative sentiment about the problem space or existing solutions' },
    { id: 2, name: 'Praise & what works', kind: 'praise', description: 'Positive sentiment, things users already like' },
    { id: 3, name: 'Feature requests', kind: 'feature-request', description: 'Explicit asks: "I wish it could…"' },
    { id: 4, name: 'Comparisons & alternatives', kind: 'comparison', description: 'Mentions of competitors or alternatives' },
    { id: 5, name: 'Use cases & context', kind: 'use-case', description: 'Who uses it and in what situations' },
    { id: 6, name: 'Confusion & friction', kind: 'confusion', description: 'Things users don\'t understand or hit friction with' },
  ];
}

const NEG = ['hate', 'terrible', 'worst', 'broken', 'bug', 'fail', 'frustrat', 'annoying', 'horrible', 'useless', 'scam', 'refund', 'crash', 'slow', 'confusing', 'disappoint', 'waste', 'awful', 'meh', 'overpriced', 'expensive'];
const POS = ['love', 'great', 'best', 'amazing', 'fantastic', 'excellent', 'perfect', 'superb', 'recommend', 'impressive', 'awesome', 'helpful', 'solves', 'worth', 'game changer'];
const FEAT = ['wish it', "would be nice", 'please add', 'feature request', 'why is there no', 'missing', 'needs a', 'integration', 'support for'];

function heuristicLabels(db: Database.Database, buckets: Bucket[]): Map<string, LabelResult> {
  const out = new Map<string, LabelResult>();
  const all = fetchRows(db, 'SELECT id, title, body FROM records') as any[];
  const { tokens, phrases } = relevanceTokensFromStore(db, all);
  for (const r of all) {
    const t = `${r.title} ${r.body}`.toLowerCase();
    const neg = NEG.filter((w) => t.includes(w)).length;
    const pos = POS.filter((w) => t.includes(w)).length;
    const feat = FEAT.filter((w) => t.includes(w)).length;
    let bucket: number;
    if (feat >= 1 && feat > neg && feat > pos) bucket = 3;
    else if (t.includes('alternative') || t.includes('vs ') || t.includes('instead')) bucket = 4;
    else if (neg > pos) bucket = 1;
    else if (pos > neg) bucket = 2;
    else bucket = buckets.length > 4 ? 5 : buckets[buckets.length - 1].id;
    const sentiment: LabelResult['sentiment'] = neg > pos ? 'negative' : pos > neg ? 'positive' : 'neutral';
    const relevant = phrases.some((p) => t.includes(p)) || [...tokens].some((x) => t.includes(x));
    out.set(r.id, { id: r.id, bucket, sentiment, relevance: relevant ? 'relevant' : 'irrelevant' });
  }
  return out;
}

function relevanceTokensFromStore(db: Database.Database, all: any[]) {
  void db;
  const text = all.map((x) => x.title).join(' ').toLowerCase();
  const tokens = new Set<string>();
  for (const w of text.split(/[^a-z0-9]+/)) if (w.length >= 4 && !STOPWORDS.has(w)) tokens.add(w);
  return { tokens, phrases: [] as string[] };
}
