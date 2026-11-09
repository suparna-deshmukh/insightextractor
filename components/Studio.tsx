'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from './Markdown';

type SourceId = 'hn' | 'reddit' | 'appstore' | 'play' | 'github' | 'google' | 'producthunt' | 'youtube';
type Objective = 'problem-discovery' | 'product-validation' | 'post-launch' | 'competitor-teardown' | 'feature-prioritization';
type ReportFormat = 'one-pager' | 'full-report' | 'data-first' | 'exec-brief' | 'raw-data';
type PipelineMode = 'rapid' | 'deep';
type ReportLength = 'concise' | 'standard' | 'detailed';
type ReportTone = 'formal' | 'conversational' | 'neutral';
type TfPreset = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';
type Phase = 'wizard' | 'running' | 'done' | 'error';
type Tab = 'report' | 'buckets' | 'evidence' | 'sql';

interface Tf { preset: TfPreset; start?: string; end?: string }
interface ProviderInfo { id: string; name: string; keyless: boolean; keySet: boolean; requiresKey?: string; fails: number; successes: number; lastError?: string }
interface SourceInfo { id: SourceId; label: string; icon: string; tagline: string; keyless: boolean; ready: boolean; keyHint?: string; providers: ProviderInfo[] }
interface KeyUsageView { name: string; used: number; quota: number; exhausted: boolean; remaining: number; cooldownUntil?: number | null }
interface UsageView { day: string; keys: KeyUsageView[]; totalUsed: number; totalQuota: number }
interface RunWindowView { ok: boolean; used: number; limit: number; resetsAt: number }
interface HealthView { gemini: boolean; model: string; sources: SourceInfo[]; usage?: UsageView; runWindow?: RunWindowView }
interface RunSummary { id: string; ts: number; topic: string; objective: Objective; platforms: SourceId[]; keptRecords: number; durationMs: number; format: ReportFormat; mode: PipelineMode }
interface LogLine { t: string; text: string; tone: 'info' | 'ok' | 'warn' | 'error' | 'stage' }
interface SourceLive { fetched: number; warning?: string; done: boolean }
interface BucketStat {
  bucket: { id: number; name: string; description: string; kind: string };
  count: number; share: number; avgScore: number; positive: number; negative: number; neutral: number;
  bySource: { source: SourceId; count: number }[];
  topQuotes: { id: string; source: SourceId; title: string; body: string; url: string; date: string; score: number; author: string }[];
}
interface Labeled { id: string; source: SourceId; title: string; body: string; url: string; author: string; date: string; score: number; bucket: number; sentiment: string; relevance?: string }
interface RunResult {
  topic: string; description: string; objective: Objective;
  plan: { keywords: string[]; queries?: Record<string, string[]>; apps: { name: string; stores: string[] }[]; subreddits: string[]; lookFor?: string[]; hypotheses: string[] };
  totalRecords: number; keptRecords: number; irrelevantDropped: number;
  perSource: { source: SourceId; fetched: number; kept: number; warning?: string }[];
  buckets: BucketStat[];
  trend: { date: string; count: number }[];
  labeled: Labeled[];
  rawCsv: string;
  sqlAudit: { stage: string; sql: string; rows: number; summary: string }[];
  report: string; model: string; usedLlm: boolean; durationMs: number;
}
interface ClientRequest {
  topic: string; description: string; objective: Objective;
  competitors: string[]; industry: string; audience: string;
  keywords: string[]; focusAreas: string[]; compareCompetitors: boolean;
  reportLength: ReportLength; tone: ReportTone;
  appsHint: string[]; brandHint: string;
  platforms: SourceId[];
  timeframes: { default: Tf; overrides: Record<string, Tf> };
  format: ReportFormat; mode: PipelineMode;
}

const STEPS = ['Topic', 'Platforms', 'Refine & output', 'Review'];
const SRC_LABEL: Record<string, string> = { hn: 'Hacker News', reddit: 'Reddit', appstore: 'App Store', play: 'Play Store', github: 'GitHub', google: 'Google', producthunt: 'Product Hunt', youtube: 'YouTube' };

const OBJECTIVES: { id: Objective; t: string; d: string }[] = [
  { id: 'problem-discovery', t: 'Problem discovery', d: 'Find what real people struggle with in this space before you build.' },
  { id: 'product-validation', t: 'Product validation', d: 'Is there demand for this product? What would make people pay?' },
  { id: 'post-launch', t: 'Post-launch feedback', d: 'We shipped it. What are users praising, hating and requesting?' },
  { id: 'competitor-teardown', t: 'Competitor teardown', d: 'Where do competitors hurt? What do users switch over and why?' },
  { id: 'feature-prioritization', t: 'Feature prioritization', d: 'Rank what to build next using frequency + intensity of asks.' },
];
const FORMATS: { id: ReportFormat; t: string; d: string }[] = [
  { id: 'one-pager', t: 'PM One-Pager', d: 'Fixed 9-section User Insights report. A PM finishes it in 4 minutes. Recommended.' },
  { id: 'exec-brief', t: 'Executive Brief', d: 'A VP 90-second read: key findings, what it means, top-3 recommendations.' },
  { id: 'full-report', t: 'Full Research Report', d: 'One-pager + hypothesis checks, competitor mentions and methodology appendix.' },
  { id: 'data-first', t: 'Data-First', d: 'Minimal prose, maximum data: JSON + CSV exports are the primary artifact.' },
  { id: 'raw-data', t: 'Raw Data', d: 'No synthesis: a CSV of the raw relevant insights (bucket, sentiment, full text, source links) is the artifact. Skips the 3rd Gemini call.' },
];
const MODES: { id: PipelineMode; t: string; ic: string; d: string; spec: string[] }[] = [
  { id: 'rapid', t: 'Rapid Scan', ic: '⚡', d: 'Fast pass for a quick read on the terrain. Fewer records, single labeling pass.', spec: ['~1–2 min typical', 'up to ~400 records', '4 insight buckets', '≤3 Gemini calls'] },
  { id: 'deep', t: 'Deep Dive', ic: '🔬', d: 'Full research pass: wider fetch, full corpus labeling, full SQL analysis.', spec: ['~3–6 min typical', 'up to ~900 records', '6 insight buckets', '≤3 Gemini calls (larger payloads)'] },
];
const LENGTHS: { id: ReportLength; t: string; d: string }[] = [
  { id: 'concise', t: 'Concise', d: 'Cut ~40%: 3 bullets/section, max 3 recs.' },
  { id: 'standard', t: 'Standard', d: 'Balanced depth for a working PM.' },
  { id: 'detailed', t: 'Detailed', d: 'Expanded: 6 bullets/section, 5 recs, more quotes.' },
];
const TONES: { id: ReportTone; t: string; d: string }[] = [
  { id: 'formal', t: 'Formal', d: 'Executive, zero filler, no contractions.' },
  { id: 'neutral', t: 'Neutral', d: 'Neutral professional.' },
  { id: 'conversational', t: 'Conversational', d: 'Plain-spoken, contractions fine, data-first.' },
];
const FOCUS_AREAS = ['Features & gaps', 'Pricing & monetization', 'UX & usability', 'Performance & reliability', 'Security & privacy', 'Support & onboarding', 'Integrations', 'Marketing & positioning'];
const INDUSTRIES = ['SaaS', 'E-commerce', 'Fintech', 'Healthtech', 'Edtech', 'DevTools', 'AI / ML', 'Consumer', 'Travel', 'Real Estate', 'Gaming', 'Media & Entertainment', 'HR / Talent', 'Logistics', 'Cybersecurity', 'Marketing', 'Legal', 'Construction', 'Agriculture', 'Hospitality', 'Automotive', 'Retail', 'Food & Beverage', 'Fashion', 'Sports & Fitness', 'Pets', 'Beauty', 'Home & Garden', 'B2B Services', 'Insurance', 'Telecom', 'Energy', 'Manufacturing', 'Non-profit', 'Government', 'Research / Academia', 'Healthcare', 'Other'];
const AUDIENCES = ['B2B SaaS buyers', 'Startups', 'Enterprises', 'SMBs', 'Developers', 'Designers', 'Marketers', 'Product managers', 'Data analysts', 'Students', 'Teachers', 'Parents', 'Seniors', 'Gen Z', 'Millennials', 'Professionals', 'Remote workers', 'Freelancers', 'Creators', 'Healthcare workers', 'Finance professionals', 'Shoppers', 'Tech-savvy users', 'Budget-conscious', 'Luxury buyers', 'Ops teams', 'Other'];
const BRAND_INDUSTRIES = ['SaaS', 'B2B Services', 'Fintech', 'E-commerce', 'DevTools'];

function now() { return new Date().toLocaleTimeString('en-GB', { hour12: false }); }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }
function timeStr(ts: number) { return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); }
function timeAgo(ts: number) {
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)}h ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + timeStr(ts);
}
function describeTf(preset: string, start?: string, end?: string) {
  if (preset === 'all') return 'All time';
  if (preset === 'custom') return `${start || '?'} → ${end || '?'}`;
  if (preset === 'default') return 'Default';
  return { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '1y': 'Last 1 year' }[preset] ?? preset;
}
function splitList(s: string) { return s.split(',').map((x) => x.trim()).filter(Boolean); }

export default function Studio() {
  const [health, setHealth] = useState<HealthView | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [phase, setPhase] = useState<Phase>('wizard');
  const [step, setStep] = useState(0);
  const [stepErr, setStepErr] = useState('');

  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState<Objective>('problem-discovery');
  const [competitors, setCompetitors] = useState('');
  const [industry, setIndustry] = useState('');
  const [audience, setAudience] = useState('');
  const [appsHint, setAppsHint] = useState('');
  const [brandHint, setBrandHint] = useState('');

  const [platforms, setPlatforms] = useState<SourceId[]>([]);
  const [platFilter, setPlatFilter] = useState('');
  const [tfPreset, setTfPreset] = useState<TfPreset>('30d');
  const [tfStart, setTfStart] = useState(daysAgo(90));
  const [tfEnd, setTfEnd] = useState(today());
  const [platKeyInput, setPlatKeyInput] = useState<Record<string, string>>({});

  const [keywords, setKeywords] = useState('');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [compareCompetitors, setCompareCompetitors] = useState(false);
  const [format, setFormat] = useState<ReportFormat>('one-pager');
  const [mode, setMode] = useState<PipelineMode>('rapid');
  const [reportLength, setReportLength] = useState<ReportLength>('standard');
  const [tone, setTone] = useState<ReportTone>('neutral');

  const [stageIdx, setStageIdx] = useState(0);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [live, setLive] = useState<Record<string, SourceLive>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [loadedReq, setLoadedReq] = useState<ClientRequest | null>(null);
  const [runErr, setRunErr] = useState('');
  const [tab, setTab] = useState<Tab>('report');
  const [toast, setToast] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);
  const uid = useRef('');

  const refreshMeta = useCallback(async () => {
    try {
      const [h, r] = await Promise.all([
        fetch('/api/sources/health', { headers: { 'x-insight-extractor-user': uid.current } }).then((x) => x.json()),
        fetch('/api/runs', { headers: { 'x-insight-extractor-user': uid.current } }).then((x) => x.json()),
      ]);
      setHealth(h);
      if (Array.isArray(r.runs)) setRuns(r.runs);
    } catch { /* server not ready yet */ }
  }, []);

  useEffect(() => {
    let u = '';
    try {
      u = localStorage.getItem('insight_extractor_uid') || localStorage.getItem('askcard_uid') || '';
      if (!u) { u = 'u' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('insight_extractor_uid', u); }
    } catch { u = 'local'; }
    uid.current = u;
    refreshMeta();
    const iv = setInterval(refreshMeta, 60_000);
    return () => clearInterval(iv);
  }, [refreshMeta]);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs]);

  const addLog = (text: string, tone: LogLine['tone'] = 'info') => setLogs((l) => [...l, { t: now(), text, tone }]);

  const appSignal = /app|apps|application|ios|android|iphone|mobile|play store|app store/i.test(`${topic} ${description}`);
  const brandSignal = /brand|saas|b2b|b2c|startup|company|product line|platform/i.test(`${topic} ${description}`) || BRAND_INDUSTRIES.includes(industry);

  const validateStep = (s: number): string => {
    if (s === 0) {
      if (topic.trim().length < 3) return 'Give your topic a short name (min 3 characters).';
      if (description.trim().length < 30) return 'Describe the topic in at least 30 characters — the agent plans its extraction from this text.';
    }
    if (s === 1) {
      if (platforms.length === 0) return 'Select at least one platform to tap into.';
      if (tfPreset === 'custom') {
        if (!tfStart || !tfEnd) return 'Custom range needs both start and end dates.';
        if (tfStart > tfEnd) return 'Start date must be on or before end date.';
        if (tfStart > today()) return 'Start date cannot be in the future.';
      }
    }
    return '';
  };

  const buildRequest = (): ClientRequest => {
    return {
      topic: topic.trim(),
      description: description.trim(),
      objective,
      competitors: splitList(competitors),
      industry, audience,
      keywords: splitList(keywords).slice(0, 10),
      focusAreas,
      compareCompetitors,
      reportLength, tone,
      appsHint: splitList(appsHint).slice(0, 6),
      brandHint: brandHint.trim(),
      platforms,
      timeframes: { default: tfPreset === 'custom' ? { preset: 'custom', start: tfStart, end: tfEnd } : { preset: tfPreset }, overrides: {} },
      format, mode,
    };
  };

  const next = () => {
    const err = validateStep(step);
    if (err) { setStepErr(err); return; }
    setStepErr('');
    if (step < 3) setStep(step + 1);
    else startRun();
  };

  const startRun = async () => {
    setPhase('running'); setLogs([]); setLive({}); setStageIdx(0); setResult(null); setRunErr(''); setTab('report'); setLoadedReq(null);
    const req = buildRequest();
    addLog(`Agent booting — ${req.platforms.length} platforms, ${describeTf(tfPreset, tfStart, tfEnd)}, ${MODES.find((m) => m.id === mode)?.t}.`, 'stage');
    addLog('Gemini budget for this run: ≤3 calls (master plan → label corpus → report).', 'info');
    try {
      const res = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-insight-extractor-user': uid.current },
        body: JSON.stringify(req),
      });
      if (!res.ok || !res.body) { setRunErr(`Server error ${res.status}`); setPhase('error'); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let gotResult = false;
      let sawError = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            let e: any; try { e = JSON.parse(line.slice(6)); } catch { continue; }
            if (e.type === 'stage') { setStageIdx(e.index); addLog(`▸ ${e.stage}`, 'stage'); }
            else if (e.type === 'log') addLog(e.text, e.tone ?? 'info');
            else if (e.type === 'source') setLive((l) => ({ ...l, [e.source]: { fetched: e.fetched, warning: e.warning, done: true } }));
            else if (e.type === 'result') { gotResult = true; setResult(e.result); setPhase('done'); addLog(`Done in ${(e.result.durationMs / 1000).toFixed(1)}s — ${e.result.keptRecords} records across ${e.result.perSource.length} platforms.`, 'ok'); }
            else if (e.type === 'error') { sawError = true; setRunErr(e.message); addLog(`ERROR: ${e.message}`, 'error'); }
          }
        }
      }
      refreshMeta();
      if (!gotResult && !sawError) { setRunErr('Stream ended without a result.'); setPhase('error'); }
      if (sawError && !gotResult) setPhase('error');
    } catch (err) {
      setRunErr((err as Error).message); setPhase('error');
    }
  };

  const loadRun = async (id: string) => {
    try {
      const r = await fetch(`/api/runs/${id}`, { headers: { 'x-insight-extractor-user': uid.current } }).then((x) => x.json());
      if (!r || !r.result) { setToast('Run not found'); setTimeout(() => setToast(''), 2000); return; }
      setLoadedReq(r.request);
      setResult(r.result);
      setPhase('done'); setTab('report'); setRunErr('');
      setLogs([{ t: now(), text: `Loaded from history — ${r.result.topic} (${r.result.keptRecords} records, ${(r.result.durationMs / 1000).toFixed(0)}s).`, tone: 'stage' }]);
    } catch {
      setToast('Could not load that run'); setTimeout(() => setToast(''), 2000);
    }
  };

  const togglePlatform = (id: SourceId) =>
    setPlatforms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const savePlatKey = async (id: string, keyName: string) => {
    const val = (platKeyInput[`${id}:${keyName}`] ?? '').trim();
    if (!val) return;
    const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [keyName]: val }) });
    const j = await r.json();
    if (j.ok) { setToast(`${keyName} saved`); setPlatKeyInput((m) => ({ ...m, [`${id}:${keyName}`]: '' })); refreshMeta(); }
    else setToast(j.error ?? 'Key save failed');
    setTimeout(() => setToast(''), 2200);
  };

  const dl = (name: string, content: string, mime: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  const bucketName = (id: number) => result?.buckets.find((b) => b.bucket.id === id)?.bucket.name ?? `#${id}`;
  const exportCsv = () => {
    if (!result) return;
    const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = result.labeled.map((r) => [r.id, r.source, `${r.bucket}|${bucketName(r.bucket)}`, r.sentiment, r.score, r.date, r.author, r.title, r.url].map((x) => esc(String(x))).join(','));
    dl(`insight_extractor_${result.topic.replace(/\s+/g, '_').toLowerCase()}_evidence.csv`, ['id,source,bucket,sentiment,score,date,author,title,url', ...rows].join('\n'), 'text/csv');
  };
  const exportRawCsv = () => {
    if (!result?.rawCsv) return;
    dl(`insight_extractor_${result.topic.replace(/\s+/g, '_').toLowerCase()}_raw_insights.csv`, result.rawCsv, 'text/csv');
  };
  const copyMd = async () => { if (!result) return; await navigator.clipboard.writeText(result.report); setToast('Report copied to clipboard'); setTimeout(() => setToast(''), 2200); };

  const srcMeta = (id: SourceId): SourceInfo | undefined => health?.sources.find((s) => s.id === id);
  const geminiOn = health?.gemini ?? false;
  const usage = health?.usage;
  const runWindow = health?.runWindow;

  // run-head meta: loaded history run vs current wizard state
  const metaPlatforms: SourceId[] = loadedReq ? loadedReq.platforms : platforms;
  const metaTf = loadedReq ? describeTf(loadedReq.timeframes.default.preset, loadedReq.timeframes.default.start, loadedReq.timeframes.default.end) : describeTf(tfPreset, tfStart, tfEnd);
  const metaMode = loadedReq ? loadedReq.mode : mode;
  const metaFormat = loadedReq ? loadedReq.format : format;

  const visibleSources = (health?.sources ?? []).filter((s) =>
    !platFilter || s.label.toLowerCase().includes(platFilter.toLowerCase()) || s.tagline.toLowerCase().includes(platFilter.toLowerCase())
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-in">
          <div className="logo"><div className="logo-mark">I</div>Insight Extractor <span className="logo-sub">Agentic Research for PMs</span></div>
          <div className="topbar-right">
            {usage && usage.keys.length > 0 && (
              <span className="pill" title={`Shared across all users of this deployment. Failed keys are remembered for the day — the next run automatically starts with the next healthy key.\nPer key:\n${usage.keys.map((k) => `${k.name}: ${k.used}/${k.quota}${k.exhausted ? ' (exhausted today)' : k.cooldownUntil ? ' (cooling down)' : ''}`).join('\n')}`}>
                <span className={usage.totalQuota - usage.totalUsed > 0 ? 'dot' : 'dot amber'} />◆ {usage.totalUsed}/{usage.totalQuota} shared gemini calls today
              </span>
            )}
            {runWindow && (
              <span className="pill" title="Per-user limit: agent runs per rolling window (auto-refreshes)">
                ▶ {runWindow.limit - runWindow.used}/{runWindow.limit} runs left · resets {timeStr(runWindow.resetsAt)}
              </span>
            )}
            {health && (
              <span className="pill"><span className={geminiOn ? 'dot' : 'dot amber'} />{geminiOn ? `Gemini · ${health.model}` : 'No Gemini key — heuristic fallback'}</span>
            )}
            <button className="icon-btn" title="API keys & usage" onClick={() => setSettingsOpen(true)}>⚙</button>
          </div>
        </div>
      </div>

      <div className="shell">
        {phase === 'wizard' && (
          <>
            <div className="hero">
              <h1>Type a topic. The agent taps <span className="grad">every platform.</span><br />You get user insights.</h1>
              <p>An agentic extractor plans the research from your description, pulls live reviews & feedback from the platforms you choose, buckets the signal with LLM + SQL, and hands a product manager a fixed-format insight report — on a strict ≤3 Gemini-calls-per-run budget.</p>
              <div className="steps-line">
                <span className="chip">🧠 1 call plans everything</span>
                <span className="chip">📡 8 live platform APIs</span>
                <span className="chip">🗄 SQL cleaning & aggregation</span>
                <span className="chip">📊 Bucketed user insights</span>
              </div>
            </div>

            <div className="stepper">
              {STEPS.map((s, i) => (
                <button key={s} className={i === step ? 'active' : i < step ? 'done' : ''} disabled={i > step} onClick={() => i < step && setStep(i)}>
                  <span className="num">{i < step ? '✓' : i + 1}</span>{s}
                </button>
              ))}
            </div>

            {step === 0 && (
              <div className="card">
                <h2>What are you researching?</h2>
                <div className="sub">The agent reads this and plans every fetch. The more specific you are, the sharper the extraction.</div>
                <div className="field">
                  <label>Topic name</label>
                  <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Meal-kit delivery in India" />
                  <div className="hint">Short name — used as the report title.</div>
                </div>
                <div className="field">
                  <label>Detailed description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is the product or problem? Who is it for? What do you already believe? What would change your mind? E.g. “We are evaluating whether to build a B2B meal-kit service for office cafeterias in Bengaluru and Mumbai. We care about price sensitivity, delivery reliability complaints, and what people complain about with existing players…”" />
                  <div className={`char-count ${description.trim().length >= 30 ? 'ok' : ''}`}>{description.trim().length}/30 min characters</div>
                </div>
                <div className="field">
                  <label>What is this research for?</label>
                  <div className="obj-grid">
                    {OBJECTIVES.map((o) => (
                      <button key={o.id} className={`pick ${objective === o.id ? 'sel' : ''}`} onClick={() => setObjective(o.id)}>
                        <div className="t">{o.t}</div><div className="d">{o.d}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Industry</label>
                  <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                    <option value="">Select (optional — sharpens planning & report framing)</option>
                    {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Target audience</label>
                  <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                    <option value="">Select (optional)</option>
                    {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Competitors / known players (optional)</label>
                  <input type="text" value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="Comma-separated, e.g. Eat.fit, Farmley, HelloFresh" />
                  <div className="hint">The agent mines reviews for these and tracks mention framing.</div>
                </div>
                {appSignal && (
                  <div className="field">
                    <label>App names to mine (App Store + Play Store)</label>
                    <input type="text" value={appsHint} onChange={(e) => setAppsHint(e.target.value)} placeholder="Comma-separated exact app names, e.g. EatFit, Farmley" />
                    <div className="hint">Detected mobile-app topic — these apps will be mined for store reviews (verified against live stores at fetch time).</div>
                  </div>
                )}
                {brandSignal && (
                  <div className="field">
                    <label>Brand / product line</label>
                    <input type="text" value={brandHint} onChange={(e) => setBrandHint(e.target.value)} placeholder="e.g. EatFit — or your own brand if evaluating the space" />
                    <div className="hint">Detected brand/SaaS topic — the agent focuses signal on this line.</div>
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="card">
                <h2>Which platforms should the agent tap into?</h2>
                <div className="sub">Each platform is a live API with its own fallback ladder. Pick the ones you want tapped — the global time frame above applies to all of them.</div>
                <div className="field">
                  <label>Global time frame</label>
                  <div className="pills">
                    {([['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['1y', 'Last 1 year'], ['all', 'All time'], ['custom', 'Custom range…']] as const).map(([v, l]) => (
                      <button key={v} className={`pill-btn ${tfPreset === v ? 'sel' : ''}`} onClick={() => setTfPreset(v)}>{l}</button>
                    ))}
                  </div>
                  {tfPreset === 'custom' && (
                    <div className="custom-range">
                      <span>From</span><input type="date" value={tfStart} max={today()} onChange={(e) => setTfStart(e.target.value)} />
                      <span>to</span><input type="date" value={tfEnd} max={today()} onChange={(e) => setTfEnd(e.target.value)} />
                    </div>
                  )}
                </div>
                <div className="field">
                  <label>Search platforms</label>
                  <input type="text" value={platFilter} onChange={(e) => setPlatFilter(e.target.value)} placeholder="e.g. hacker, reddit, app, review…" />
                </div>
                <div className="plat-grid">
                  {visibleSources.map((s) => {
                    const keyNames = [...new Set(s.providers.filter((p) => p.requiresKey).map((p) => p.requiresKey!))];
                    const anyKeySet = keyNames.length === 0 || s.providers.some((p) => p.requiresKey && p.keySet);
                    return (
                      <React.Fragment key={s.id}>
                        <button className={`plat ${platforms.includes(s.id) ? 'sel' : ''}`} onClick={() => togglePlatform(s.id)}>
                          <span className="ic">{s.icon}</span>
                          <span style={{ flex: 1 }}>
                            <span className="t">{s.label} <span className={`badge ${s.keyless ? 'free' : anyKeySet ? 'free' : 'key'}`}>{s.keyless ? (s.ready ? 'live' : 'offline') : anyKeySet ? 'key set' : 'key needed'}</span></span>
                            <span className="d" style={{ display: 'block' }}>{s.tagline}</span>
                            <span className="d" style={{ display: 'block', marginTop: 5, fontFamily: 'var(--mono)', fontSize: 11 }}>
                              {s.providers.map((p, i) => (
                                <span key={p.id} style={{ color: !p.keySet ? 'var(--text-faint)' : p.fails >= 2 ? 'var(--err)' : p.fails === 1 ? 'var(--warn)' : 'var(--ok)' }}>
                                  {i > 0 ? ' › ' : ''}{p.name}{!p.keySet ? ' (no key)' : p.fails ? ` ${p.fails}F` : p.successes ? ' ok' : ' new'}
                                </span>
                              ))}
                            </span>
                          </span>
                          <span className="check">✓</span>
                        </button>
                        {platforms.includes(s.id) && keyNames.length > 0 && (
                          <div className="plat-detail">
                            {keyNames.map((kn) => {
                              const isSet = s.providers.some((p) => p.requiresKey === kn && p.keySet);
                              return (
                                <div className="pd-row" key={kn}>
                                  <span className="pd-label">{kn}</span>
                                  <input type="password" placeholder={s.keyHint || 'paste API key'} value={platKeyInput[`${s.id}:${kn}`] ?? ''}
                                    onChange={(e) => setPlatKeyInput((m) => ({ ...m, [`${s.id}:${kn}`]: e.target.value }))}
                                    onBlur={(e) => e.target.value.trim() && savePlatKey(s.id, kn)} />
                                  <span className={`pd-status ${isSet ? 'ok' : ''}`}>{isSet ? 'key set ✓' : 'no key — other providers still work'}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                {platforms.length === 0 && <div className="err-msg">Select at least one platform.</div>}
              </div>
            )}

            {step === 2 && (
              <div className="card">
                <h2>Refine scope & choose the output</h2>
                <div className="sub">Everything here sharpens the plan and decides exactly what you receive.</div>
                <div className="field">
                  <label>Extra keywords (optional, comma-separated)</label>
                  <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g. delivery delays, subscription pricing" />
                  <div className="hint">Merged into the agent's search plan on top of what it derives from your description.</div>
                </div>
                <div className="field">
                  <label>Focus areas (optional — tap to toggle)</label>
                  <div className="chip-row">
                    {FOCUS_AREAS.map((f) => (
                      <button key={f} className={`fchip ${focusAreas.includes(f) ? 'sel' : ''}`} onClick={() => setFocusAreas((a) => a.includes(f) ? a.filter((x) => x !== f) : [...a, f])}>{f}</button>
                    ))}
                  </div>
                </div>
                {competitors.trim() && (
                  <div className="toggle-row" onClick={() => setCompareCompetitors((v) => !v)}>
                    <span className={`check ${compareCompetitors ? '' : 'off'}`}>{compareCompetitors ? '✓' : ''}</span>
                    <span><b>Compare competitors in the report</b> — adds a dedicated COMPETITOR COMPARISON section for {splitList(competitors).join(', ')}.</span>
                  </div>
                )}
                <div className="field">
                  <label>Output format</label>
                  <div className="mode-grid">
                    {FORMATS.map((f) => (
                      <button key={f.id} className={`mode-card ${format === f.id ? 'sel' : ''}`} onClick={() => setFormat(f.id)}>
                        <div className="t">{f.t}</div><div className="d">{f.d}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Analysis pipeline</label>
                  <div className="mode-grid">
                    {MODES.map((m) => (
                      <button key={m.id} className={`mode-card ${mode === m.id ? 'sel' : ''}`} onClick={() => setMode(m.id)}>
                        <div className="t"><span className="ic">{m.ic}</span>{m.t}</div>
                        <div className="d">{m.d}</div>
                        <div className="spec">{m.spec.map((s) => <span key={s}>• {s}</span>)}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Report length</label>
                  <div className="mode-grid">
                    {LENGTHS.map((l) => (
                      <button key={l.id} className={`mode-card ${reportLength === l.id ? 'sel' : ''}`} onClick={() => setReportLength(l.id)}>
                        <div className="t">{l.t}</div><div className="d">{l.d}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Tone</label>
                  <div className="mode-grid">
                    {TONES.map((t) => (
                      <button key={t.id} className={`mode-card ${tone === t.id ? 'sel' : ''}`} onClick={() => setTone(t.id)}>
                        <div className="t">{t.t}</div><div className="d">{t.d}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <div className="hint" style={{ fontSize: 13 }}>
                    Next steps with this configuration: Gemini <b>plans</b> (1 call) → <b>fetch</b> {platforms.length} platforms in parallel over {describeTf(tfPreset, tfStart, tfEnd).toLowerCase()} (all share this time frame) → <b>clean & load</b> into SQLite → <b>label</b> up to {mode === 'rapid' ? '400' : '900'} records in one pass (2nd call) → <b>SQL analysis</b> → {format === 'raw-data' ? <>emit a <b>raw CSV</b> of the relevant insights (3rd call skipped — the CSV is the artifact).</> : <><b>synthesize</b> a {FORMATS.find((f) => f.id === format)?.t} (3rd call).</>}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="card">
                <h2>Review & run</h2>
                <div className="sub">Confirm the brief, then launch the agent. This run uses at most 3 Gemini API calls.</div>
                <div className="review-grid">
                  <div className="review-item"><div className="k">Topic</div><div className="v">{topic || '—'}</div><div className="edit" onClick={() => setStep(0)}>edit</div></div>
                  <div className="review-item"><div className="k">Objective</div><div className="v">{OBJECTIVES.find((o) => o.id === objective)?.t}</div><div className="edit" onClick={() => setStep(0)}>edit</div></div>
                  <div className="review-item"><div className="k">Industry / Audience</div><div className="v">{industry || '—'}{industry && audience ? ' · ' : ''}{audience || '—'}</div><div className="edit" onClick={() => setStep(0)}>edit</div></div>
                  <div className="review-item"><div className="k">Competitors</div><div className="v">{competitors || '—'}{compareCompetitors && competitors ? ' (compared in report)' : ''}</div><div className="edit" onClick={() => setStep(0)}>edit</div></div>
                  {appSignal && appsHint && <div className="review-item"><div className="k">Apps to mine</div><div className="v">{appsHint}</div><div className="edit" onClick={() => setStep(0)}>edit</div></div>}
                  {brandSignal && brandHint && <div className="review-item"><div className="k">Brand / line</div><div className="v">{brandHint}</div><div className="edit" onClick={() => setStep(0)}>edit</div></div>}
                  <div className="review-item"><div className="k">Platforms</div><div className="v">{platforms.map((p) => SRC_LABEL[p]).join(', ') || '—'}</div><div className="edit" onClick={() => setStep(1)}>edit</div></div>
                  <div className="review-item"><div className="k">Time frame</div><div className="v">{describeTf(tfPreset, tfStart, tfEnd)} (applies to every selected platform)</div><div className="edit" onClick={() => setStep(1)}>edit</div></div>
                  <div className="review-item"><div className="k">Keywords / Focus</div><div className="v">{keywords || '—'}{focusAreas.length ? ` · ${focusAreas.join(', ')}` : ''}</div><div className="edit" onClick={() => setStep(2)}>edit</div></div>
                  <div className="review-item"><div className="k">Output</div><div className="v">{FORMATS.find((f) => f.id === format)?.t} · {reportLength} · {tone}</div><div className="edit" onClick={() => setStep(2)}>edit</div></div>
                  <div className="review-item"><div className="k">Pipeline</div><div className="v">{MODES.find((m) => m.id === mode)?.t}</div><div className="edit" onClick={() => setStep(2)}>edit</div></div>
                  <div className="review-item"><div className="k">Gemini budget</div><div className="v">{usage && usage.keys.length ? `${usage.totalQuota - usage.totalUsed} of ${usage.totalQuota} shared calls left today · this run ≤ 3` : 'No Gemini keys set — heuristic mode'}</div></div>
                  <div className="review-item"><div className="k">Run window</div><div className="v">{runWindow ? `${runWindow.limit - runWindow.used} of ${runWindow.limit} runs left · resets ${timeStr(runWindow.resetsAt)}` : '—'}</div></div>
                </div>
                {!geminiOn && <div className="err-msg" style={{ color: 'var(--warn)' }}>Heuristic mode: planning, bucketing and synthesis run without Gemini. Add your key(s) in ⚙ Settings for the full experience.</div>}
              </div>
            )}

            {runs.length > 0 && (
              <div className="card hist-card">
                <h2>History</h2>
                <div className="sub">Your past runs on this device — click one to open its full report, buckets and evidence.</div>
                <div className="hist-list">
                  {runs.slice(0, 10).map((r) => (
                    <button key={r.id} className="hist-item" onClick={() => loadRun(r.id)}>
                      <span className="h-topic">{r.topic}</span>
                      <span className="h-meta">{timeAgo(r.ts)} · {r.platforms.length} platforms · {r.keptRecords} records · {(r.durationMs / 1000).toFixed(0)}s · {FORMATS.find((f) => f.id === r.format)?.t}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="nav-row">
              <button className="btn ghost" onClick={() => { setStepErr(''); setStep(Math.max(0, step - 1)); }} disabled={step === 0}>← Back</button>
              <button className="btn primary" onClick={next}>{step === 3 ? '🚀 Run the agent' : 'Continue →'}</button>
            </div>
            {stepErr && <div className="err-msg" style={{ textAlign: 'right', marginTop: 10 }}>{stepErr}</div>}
          </>
        )}

        {(phase === 'running' || phase === 'done' || phase === 'error') && (
          <>
            <div className="run-head">
              <h1>{result?.topic ?? topic}</h1>
              <span className="chip">{metaPlatforms.length} platforms</span>
              <span className="chip">{metaTf}</span>
              <span className="chip">{MODES.find((m) => m.id === metaMode)?.t}</span>
              <span className="chip">{FORMATS.find((f) => f.id === metaFormat)?.t}</span>
            </div>
            <div className="stage-tracker">
              {['Understand & plan', 'Fetch platforms', 'Clean & load', 'Bucket & label', 'SQL analysis', 'Report'].map((s, i) => (
                <span key={s} className={`stage-pill ${phase === 'done' ? 'done' : stageIdx === i ? 'active' : stageIdx > i ? 'done' : ''}`}>
                  <span className="n">{phase === 'done' || stageIdx > i ? '✓' : i + 1}</span>{s}
                </span>
              ))}
            </div>

            <div className="run-grid">
              <div>
                <div className="console">
                  <div className="console-head"><span>Agent console</span><span>{phase === 'running' ? '● live' : 'finished'}</span></div>
                  <div className="console-body" ref={consoleRef}>
                    {logs.map((l, i) => (
                      <div key={i} className={`c-line c-${l.tone === 'stage' ? 'stage' : l.tone}`}>
                        <span className="c-time">{l.t}</span><span>{l.text}</span>
                      </div>
                    ))}
                    {phase === 'running' && <div className="c-line c-info"><span className="c-time">{now()}</span><span>▍</span></div>}
                  </div>
                </div>
                {phase === 'running' && (
                  <div className="card" style={{ marginTop: 14 }}>
                    <div className="sub" style={{ marginBottom: 10 }}>Live platform intake</div>
                    <div className="src-grid">
                      {metaPlatforms.map((p) => {
                        const info = srcMeta(p);
                        const st = live[p];
                        return (
                          <div key={p} className={`src-chip ${st?.done ? '' : 'pending'}`}>
                            <div className="top">{info?.icon ?? '•'} {info?.label ?? SRC_LABEL[p]}</div>
                            <div className={`count ${st?.done ? (st.warning ? 'warn' : 'ok') : ''}`}>
                              {st?.done ? (st.warning ? `⚠ ${st.warning}` : `${st.fetched} records`) : 'waiting…'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="board">
                {phase === 'error' && (
                  <div>
                    <div className="error-box">Run failed: {runErr}</div>
                    <button className="btn" onClick={() => startRun()}>↻ Retry run</button>
                    <button className="btn" onClick={() => setPhase('wizard')}>← Back to wizard</button>
                  </div>
                )}
                {phase === 'running' && (
                  <div className="waiting"><div className="big">⌬</div>The agent is working — watch the console. Results render here the moment the pipeline finishes.</div>
                )}
                {phase === 'done' && result && (
                  <>
                    <div className="tabs">
                      {([['report', '📄 Report'], ['buckets', '🧺 Buckets'], ['evidence', '🧾 Evidence'], ['sql', '🗄 SQL Audit']] as const).map(([id, l]) => (
                        <button key={id} className={`tab ${tab === id ? 'sel' : ''}`} onClick={() => setTab(id)}>{l}</button>
                      ))}
                    </div>
                    <div className="actions-row">
                      <button className="btn small" onClick={copyMd}>⧉ Copy markdown</button>
                      <button className="btn small" onClick={() => dl(`insight_extractor_${result.topic.replace(/\s+/g, '_').toLowerCase()}_insights.md`, result.report, 'text/markdown')}>⬇ .md</button>
                      <button className="btn small" onClick={() => dl(`insight_extractor_${result.topic.replace(/\s+/g, '_').toLowerCase()}_insights.json`, JSON.stringify(result, null, 2), 'application/json')}>⬇ .json</button>
                      <button className="btn small" onClick={exportCsv}>⬇ .csv (labeled evidence)</button>
                      {result.rawCsv && <button className="btn small" style={{ background: 'var(--accent, #2563eb)', color: '#fff', border: 'none' }} onClick={exportRawCsv}>⬇ .csv — raw relevant insights</button>}
                      <button className="btn small ghost" style={{ marginLeft: 'auto' }} onClick={() => { setPhase('wizard'); setStep(0); setResult(null); setLoadedReq(null); refreshMeta(); }}>＋ New analysis</button>
                    </div>
                    {tab === 'report' && <div className="card" style={{ background: 'var(--bg-2)' }}><Markdown text={result.report} /></div>}
                    {tab === 'buckets' && (
                      <div>
                        {result.buckets.map((b) => (
                          <div className="bucket-card" key={b.bucket.id}>
                            <div className="head">
                              <span className="name">{b.bucket.name}</span>
                              <span className={`kind-badge ${b.bucket.kind}`}>{b.bucket.kind.replace('-', ' ')}</span>
                              <span className="meta" style={{ marginLeft: 'auto' }}>{b.count} records · {b.share}% · avg score {b.avgScore}</span>
                            </div>
                            <div className="meta">{b.bucket.description}</div>
                            <div className="bar"><div style={{ width: `${Math.min(100, b.share * 2)}%` }} /></div>
                            <div className="sent-bar">
                              <div className="p" style={{ width: `${(b.positive / Math.max(1, b.count)) * 100}%` }} />
                              <div className="n" style={{ width: `${(b.negative / Math.max(1, b.count)) * 100}%` }} />
                              <div className="z" style={{ width: `${(b.neutral / Math.max(1, b.count)) * 100}%` }} />
                            </div>
                            <div className="sent-legend"><span>● {b.positive} positive</span><span>● {b.negative} negative</span><span>● {b.neutral} neutral</span><span style={{ marginLeft: 'auto' }}>{b.bySource.map((s) => `${SRC_LABEL[s.source]} ${s.count}`).join(' · ')}</span></div>
                            {b.topQuotes.slice(0, 2).map((q) => (
                              <div className="quote" key={q.id}>"{(q.title + ' ' + q.body).slice(0, 260)}…"
                                <span className="attr">{SRC_LABEL[q.source]}{q.author ? ` · ${q.author}` : ''} · {q.date}{q.url ? <a href={q.url} target="_blank" rel="noreferrer"> · source ↗</a> : ''}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    {tab === 'evidence' && (
                      <div className="data-wrap">
                        <table className="data">
                          <thead><tr><th>Source</th><th>Bucket</th><th>Sent.</th><th>Evidence</th><th>Score</th><th>Date</th></tr></thead>
                          <tbody>
                            {result.labeled.slice(0, 80).map((r) => (
                              <tr key={r.id}>
                                <td><span className="src-badge">{SRC_LABEL[r.source]}</span></td>
                                <td style={{ whiteSpace: 'nowrap' }}>{bucketName(r.bucket)}</td>
                                <td><span className={`sent-dot ${r.sentiment}`} /></td>
                                <td style={{ maxWidth: 420 }}>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title.slice(0, 110)}</a> : r.title.slice(0, 110)}</td>
                                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.score}</td>
                                <td style={{ whiteSpace: 'nowrap', color: 'var(--text-faint)' }}>{r.date}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {tab === 'sql' && (
                      <div>
                        {result.sqlAudit.map((q, i) => (
                          <div className="sql-entry" key={i}>
                            <div className="top"><span className="sql-tag">{q.stage}</span><span>{q.rows} rows</span></div>
                            <code>{q.sql}</code>
                            {q.summary && <div className="sum">{q.summary}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        <div className="footer-note">Insight Extractor · agentic user-insight engine for product managers · live platform APIs + Gemini + SQLite · data is a public-discourse sample, not a census</div>
      </div>

      {settingsOpen && <SettingsModal health={health} onClose={() => setSettingsOpen(false)} onSaved={refreshMeta} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function SettingsModal({ health, onClose, onSaved }: { health: HealthView | null; onClose: () => void; onSaved: () => void }) {
  const [g1, setG1] = useState('');
  const [g2, setG2] = useState('');
  const [g3, setG3] = useState('');
  const [ph, setPh] = useState('');
  const [yt, setYt] = useState('');
  const [customName, setCustomName] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [msg, setMsg] = useState('');
  const [serverKeys, setServerKeys] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const m: Record<string, string> = {};
        for (const k of d.keys ?? []) m[k.key] = k.masked;
        setServerKeys(m);
      })
      .catch(() => {});
  }, []);
  const setHint = (name: string) =>
    serverKeys[name] ? (
      <div className="hint">✓ set server-side: <span style={{ fontFamily: 'var(--mono)' }}>{serverKeys[name]}</span> — leave blank to keep, paste a value to replace.</div>
    ) : null;
  const usage = health?.usage;
  const save = async () => {
    const body: any = {};
    if (g1.trim()) body.GEMINI_API_KEY = g1.trim();
    if (g2.trim()) body.GEMINI_API_KEY_2 = g2.trim();
    if (g3.trim()) body.GEMINI_API_KEY_3 = g3.trim();
    if (ph.trim()) body.PRODUCTHUNT_API_TOKEN = ph.trim();
    if (yt.trim()) body.YOUTUBE_API_KEY = yt.trim();
    if (customName.trim() && customValue.trim()) body[customName.trim().toUpperCase()] = customValue.trim();
    if (!Object.keys(body).length) { setMsg('Paste at least one key.'); return; }
    const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    setMsg(j.ok ? `Saved: ${j.updated.join(', ')}` : j.error);
    onSaved();
    setTimeout(onClose, 900);
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>API keys & Gemini usage</h3>
        <div className="sub">Stored server-side in `.env.local` + process memory. Keys are never sent to the client after saving. The Gemini budget is SHARED across all users of this deployment: the primary key serves every call, and we switch to the next key only when it errors — a quota failure records the key as fully utilized (e.g. 20/20) and refuses it until the next Pacific midnight (when Google resets the free tier). No status-probe queries are ever sent.</div>
        {usage && usage.keys.length > 0 && (
          <table className="usage-table">
            <thead><tr><th>Key</th><th>Used today</th><th>Remaining</th><th>Status</th></tr></thead>
            <tbody>
              {usage.keys.map((k) => (
                <tr key={k.name}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{k.name}</td>
                  <td>{k.used}/{k.quota}</td>
                  <td>{k.remaining}</td>
                  <td className={k.exhausted ? 'exh' : k.cooldownUntil ? 'exh' : 'ok'}>{
                    k.exhausted ? 'exhausted today' :
                    k.cooldownUntil ? `failed — retrying in ${Math.max(1, Math.ceil((k.cooldownUntil - Date.now()) / 60000))}m` :
                    'live'
                  }</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="field"><label>Gemini API key #1</label><input type="text" value={g1} onChange={(e) => setG1(e.target.value)} placeholder="AIza…" />{setHint('GEMINI_API_KEY')}</div>
        <div className="field"><label>Gemini API key #2 (rotates in automatically)</label><input type="text" value={g2} onChange={(e) => setG2(e.target.value)} placeholder="AIza…" />{setHint('GEMINI_API_KEY_2')}</div>
        <div className="field"><label>Gemini API key #3 (rotates in automatically)</label><input type="text" value={g3} onChange={(e) => setG3(e.target.value)} placeholder="AIza…" />{setHint('GEMINI_API_KEY_3')}</div>
        <div className="field"><label>Product Hunt token (optional)</label><input type="text" value={ph} onChange={(e) => setPh(e.target.value)} placeholder="ph_…" />{setHint('PRODUCTHUNT_API_TOKEN')}</div>
        <div className="field"><label>YouTube Data API key (optional)</label><input type="text" value={yt} onChange={(e) => setYt(e.target.value)} />{setHint('YOUTUBE_API_KEY')}</div>
        <div className="field">
          <label>Any other API key (optional — name + value, e.g. SERPAPI_KEY)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="KEY_NAME" style={{ maxWidth: 150, textTransform: 'uppercase' }} />
            <input type="text" value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="value" />
          </div>
          <div className="hint">Stored server-side; provider ladders can reference any stored key.</div>
        </div>
        {msg && <div className="err-msg" style={{ color: 'var(--ok)' }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn ghost small" onClick={onClose}>Close</button>
          <button className="btn primary small" onClick={save}>Save keys</button>
        </div>
      </div>
    </div>
  );
}
