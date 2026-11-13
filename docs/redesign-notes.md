# Redesign notes (task 0.1)

Facts gathered from the existing code. Every later task relies on these.

## components/Studio.tsx
- `buildRequest()` (around line 201): builds the `ClientRequest` object sent to the server. Fields: topic, description, objective, competitors (`splitList` on commas), industry, audience, keywords (`.slice(0, 10)`), focusAreas (array of strings), compareCompetitors, reportLength, tone, appsHint (`.slice(0, 6)`), brandHint, platforms, timeframes `{ default: { preset } or { preset:'custom', start, end }, overrides: {} }`, format, mode.
- Exact stored values: objective `problem-discovery | product-validation | post-launch | competitor-teardown | feature-prioritization`; format `one-pager | exec-brief | full-report | data-first | raw-data`; mode `rapid | deep`; reportLength `concise | standard | detailed`; tone `formal | neutral | conversational`.
- Focus areas (8, in order): `Features & gaps`, `Pricing & monetization`, `UX & usability`, `Performance & reliability`, `Security & privacy`, `Support & onboarding`, `Integrations`, `Marketing & positioning`.
- Industry list: 39 values (SaaS, E-commerce, Fintech, Healthtech, Edtech, DevTools, AI / ML, Consumer, Travel, Real Estate, Gaming, Media & Entertainment, HR / Talent, Logistics, Cybersecurity, Marketing, Legal, Construction, Agriculture, Hospitality, Automotive, Retail, Food & Beverage, Fashion, Sports & Fitness, Pets, Beauty, Home & Garden, B2B Services, Insurance, Telecom, Energy, Manufacturing, Non-profit, Government, Research / Academia, Healthcare, Other).
- Audience list: 28 values (B2B SaaS buyers, Startups, Enterprises, SMBs, Developers, Designers, Marketers, Product managers, Data analysts, Students, Teachers, Parents, Seniors, Gen Z, Millennials, Professionals, Remote workers, Freelancers, Creators, Healthcare workers, Finance professionals, Shoppers, Tech-savvy users, Budget-conscious, Luxury buyers, Ops teams, Other).
- PLAN-NOTE: §5.3 of the plan lists focus-area labels ("Pricing", "Ease of use", "Speed and reliability", "Privacy and security"); the code values are the source of truth and are sent as `focusAreas`. The new UI shows the plain labels and maps index → code value (indexes align with the existing 8 values in the same order).
- Run loop (around lines 226-335): for(;;) POST `/api/agent/step` with `{ ...request, runToken }` and header `x-insight-extractor-user: uid`; reads SSE `data: {json}` chunks split on blank lines; events `stage` (resets drop/retry counters when index advances), `log`, `source`, `step_done` (resets counters), `step_retry` (error+refund when > 6), `result` (done), `error` (fatal); on fetch/stream exception counts a drop (wait 1500ms and re-POST, error+refund at 3 drops); non-OK response = hard fail (error+refund). Refund = POST `/api/agent/refund` `{ token: runToken }` with the uid header.
- `runToken` generator: `'rt_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)` (matches server regex `^[A-Za-z0-9_-]{8,64}$`).
- uid helper: `localStorage['insight_extractor_uid']` (fallback `askcard_uid`), created as `'u' + random + Date.now().toString(36)`; sent as header `x-insight-extractor-user` on every API call.
- Download helper: create `<a>` with `URL.createObjectURL(new Blob([content], { type: mime }))`, `a.download = name`, click, revoke. Clipboard: `navigator.clipboard.writeText` (no fallback in the old code).
- `refreshMeta`: fetches `/api/sources/health` and `/api/runs` in parallel with the uid header, every 60s.
- Old source labels: `{ hn: 'Hacker News', reddit: 'Reddit', appstore: 'App Store', play: 'Play Store', github: 'GitHub', google: 'Google', producthunt: 'Product Hunt', youtube: 'YouTube' }` (new copy: "Google Play" for `play`).
- Old app-signal regex had no word boundaries (`/app|apps|.../i`); the new `signals.ts` adds `\b` boundaries per §7.2.

## components/Markdown.tsx
Supported syntax: `#`/`##`/`###` headings, pipe tables (header + separator row), `> ` blockquotes, `- ` / `* ` bullet lists, `1. ` numbered lists, `---`/`***` hr, inline `**bold**`, `*italic*`, `` `code` ``, `[text](url)` links. No raw HTML. The report uses `##` numbered section headings (see lib/report.ts).

## app/api/agent/step/route.ts and refund
- POST body: the full `RunRequest` plus `runToken`. SSE events: `stage {stage, index, total}`, `log {text, tone}`, `source {source, fetched, kept, warning?}`, `sql {stage, sql, rows, summary}`, `result {result: RunResult}`, `step_done {stage}`, `step_retry {reason}`, `error {message}`.
- Server-side `error` already refunds the slot; client refunds only on drops (one-shot marker, so double refund is a no-op).
- Refund: POST `/api/agent/refund` body `{ token }` (8-64 chars of `[A-Za-z0-9_-]`), uid header.

## app/api/runs
- `GET /api/runs` → `{ runs: RunSummary[] }` where `RunSummary = { id, ts, topic, objective, platforms, keptRecords, durationMs, format, mode }`.
- `GET /api/runs/{id}` → `404 { error }` or `StoredRun = { id, ts, request: RunRequest, result: RunResult }` (result.labeled capped at 200 on storage).
- The stored run includes the original request. The stored run id is a different value from the client `runToken` (generated by `saveRun`).
- PLAN-NOTE: the `result` event does NOT carry the saved id, so after a run finishes the client fetches `/api/runs` and matches the newest entry whose `topic` equals the result topic (and `ts >= startedAt`) to learn the saved id, per §4.6.

## app/api/settings
- GET → `{ gemini: { set, model }, producthunt: { set }, youtube: { set }, keys: [{ key, masked }] }` (masked = first 4 + … + last 3).
- POST → body `{ ENV_NAME: value }` (name must match `^[A-Z][A-Z0-9_]{2,63}$`), one or many entries; → `{ ok: true, updated: string[] }` or `{ error }`. Same call shape for primary, backup and custom keys.

## app/api/sources/health
- GET → `{ gemini: boolean, model: string, sources: SourceInfo[], usage: { day, keys: KeyUsageView[], totalUsed, totalQuota }, runWindow: { ok, used, limit, resetsAt }, store: {...} }`.
- `SourceInfo = { id, label, icon, tagline, keyless, ready, keyHint?, providers: [{ id, name, keyless, requiresKey?, keySet, fails, successes, lastError? }] }`.
- `KeyUsageView = { name, used, quota, exhausted, remaining, cooldownUntil? }`.
- `runWindow.resetsAt` is an epoch ms of when the rolling window (default 5h, limit 5) resets.

## lib/types.ts
- `RunRequest` = the client request (see Studio.tsx values above). `RunResult` = `{ topic, description, objective, timeframe, plan {keywords, queries, apps, subreddits, lookFor, hypotheses, reddit?, problemStatement, objective}, totalRecords, keptRecords, irrelevantDropped, perSource: [{source, fetched, kept, provider?, warning?}], buckets: BucketStats[], trend: [{date, count}], labeled: (EvidenceRecord & {bucket, sentiment})[], rawCsv, sqlAudit: [{stage, sql, rows, summary}], report, model, usedLlm, durationMs }`.
- `BucketStats = { bucket: { id, name, description, kind }, count, share, avgScore, positive, negative, neutral, bySource: [{source, count}], topQuotes: EvidenceRecord[] }`; `kind` ∈ `pain | praise | feature-request | confusion | comparison | use-case`.
- `EvidenceRecord = { id, source, title, body, url, author, date, score, rating? }`.
