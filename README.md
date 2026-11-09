# Insight Extractor — Agentic User Insight Engine

**Insight Extractor** (project dir: `insightextractor`): type a topic, describe it, pick the platforms —
and an agent plans the research with Gemini, taps live platform APIs in parallel, cleans + buckets
the signal with LLM + SQL, and hands a product manager a fixed-format **User Insights Report**.

Built for real PMs: problem discovery, product validation, post-launch feedback, competitor
teardowns, feature prioritization.

## Run it

```bash
cd insightextractor
npm install
npm run dev          # http://localhost:3001
```

Keys live in `.env.local` (or paste them in the ⚙ settings modal in the UI — they persist to
`.env.local` + server memory and are never returned to the client).

```env
GEMINI_API_KEY=...            # required for full mode
GEMINI_API_KEY_2=             # optional — rotates in automatically
GEMINI_API_KEY_3=             # optional — rotates in automatically
GEMINI_MODEL=gemini-3.8-flash # fallback chain: 3.6-flash → 3.5-flash → 3.1-flash-lite
GEMINI_DAILY_QUOTA=20         # free-tier requests/day per key (default 20)
RUNS_PER_WINDOW=5             # per-user agent runs per rolling window
RUN_WINDOW_HOURS=5            # window length (ChatGPT-style, auto-refreshes)
# PRODUCTHUNT_API_TOKEN=      # optional
# YOUTUBE_API_KEY=            # optional
```

## The 4-step wizard

1. **Topic** — topic name, detailed description (the agent plans from this text), objective,
   competitors, industry + audience dropdowns, and dynamic follow-ups: mobile-app topics get an
   "app names to mine" input (verified against live store searches at fetch time), brand/SaaS
   topics get a "brand / product line" input.
2. **Platforms** — searchable multi-select over 8 live sources (Hacker News, Reddit, App Store,
   Play Store, GitHub, Google Autocomplete, Product Hunt, YouTube). Global time frame +
   **per-platform time-frame overrides**, and **per-platform API key fields** for keyed sources.
   Every platform shows its live provider fallback ladder with success/failure counts.
3. **Refine & output** — extra keywords, focus-area chips, competitor-comparison toggle,
   **5 output formats** (PM One-Pager, Executive Brief, Full Research Report, Data-First,
   Raw Data — the CSV of raw relevant insights is the artifact; the report LLM call is skipped),
   **2 analysis pipelines** (Rapid Scan / Deep Dive), 3 report lengths, 3 tones.
4. **Review & run** — every input shown with edit links, live Gemini-budget + run-window readout,
   then 🚀 Run.

Live run view: 6-stage tracker, agent console with per-provider log lines, per-platform intake
chips, and result tabs (Report / Buckets / Evidence / SQL Audit) with `.md`, `.json`, `.csv`
exports (Raw Data runs additionally export the raw relevant insights as a `.csv`).

## History (per user)

Every completed run is stored **per user** (a stable client id in `localStorage`, scoped server-side).
The wizard shows a History section — click any run to reopen its full report, buckets, evidence
and SQL audit. On Vercel the filesystem is ephemeral, so history/ledgers persist per instance.

## Gemini call budget (free tier: 20 req/day per key)

The Gemini budget is **user-agnostic: every user of this deployment draws from the same
shared pool** (keys × daily quota, reset by Google at Pacific Time midnight — all ledger
day-boundaries in this app follow PT, not UTC, to match). The per-user limit that exists is only the *run window*
below.

Each run makes **at most 3 Gemini calls**, never more (Raw Data output skips the report call — at most 2):

1. **Master plan** — ONE structured response that plans platform queries for every selected
   platform, defines the insight buckets (4 rapid / 6 deep), and authors the brainless Reddit
   execution brief. Anti-hallucination rules: only facts from the brief, low reasoning effort.
2. **Label** — the WHOLE kept corpus (up to 400 rapid / 900 deep records) is bucketed,
   sentimented and relevance-judged in a single call (safe on the 1M-token context).
3. **Report** — final synthesis from SQL aggregates, with the Reddit accountability audit.

There is **no** separate Reddit planning or verification call: the Reddit channel runs on the
master-plan brief (zero extra LLM calls), filters off-topic scrapes lexically, and files its
accountability audit (duration, min-records, query coverage, gaps) deterministically.

Every stage degrades to an honest non-LLM fallback if quota is gone — a run never fails hard and
never fabricates (0 records + an explicit gap note).

### Key rotation

Keys are used **one at a time, sticky primary-first — no load balancing and no status-probe
queries**: `GEMINI_API_KEY` serves every call as long as it works, and `GEMINI_API_KEY_2` is only
reached when the primary **errors**. A 429/"quota exceeded" **records that key as fully utilized
— quota/quota, e.g. 20/20 — and refuses it until the next Pacific midnight**, moving instantly to the
next key (the ledger tells us which key to start with next — no extra query is ever sent to check
a key's status). The same applies to **transient failures**: a key that errors out is remembered
with a 30-minute "unwell" cooldown, so the very next run — by the same user or any other user,
same day — automatically starts with the next healthy key; after the cooldown the key is quietly
retried as primary again. A 503 "high demand" moves to the next **model on the same key**
(model issues don't burn other keys' quota).

Every Gemini request this platform makes is recorded in the shared ledger (per key, per UTC
day). There is no "usage" API on the free tier, so the count is our own (every outbound request
counts) and is cross-checked by server quota signals. The top bar shows
`used/total shared gemini calls today`; ⚙ shows the per-key table with 20/20 + exhausted status.

### Shared state (localhost + Vercel)

State that must be global (the Gemini budget, run windows) lives in a small KV store
(`lib/store.ts`):

- **localhost / single instance**: JSON files under `.insight-extractor/` (a legacy `.askcard/`
  directory is migrated automatically on first use).
- **Vercel (multi-instance)**: set `INSIGHT_EXTRACTOR_REDIS_URL` (legacy `ASKCARD_REDIS_URL`
  still honored; any Redis-compatible endpoint, e.g. a
  free Upstash DB). The same counters then live in one place for every instance/region, so the
  shared budget is enforced platform-wide. If Redis is briefly unreachable the store fails open
  to local files — Google's own quota errors remain the ground truth and re-mark keys exhausted.

Provider ladders (`.insight-extractor/health.json`) and per-user run history remain local files: on
Vercel they are per-instance and reset on redeploy.

### Per-user run window

Each user gets `RUNS_PER_WINDOW` agent runs per rolling `RUN_WINDOW_HOURS` window (default
5 runs / 5 h), displayed in the top bar and auto-refreshing — the same pattern as ChatGPT/Claude.
The limit counts **runs**, not volume.

## Pipeline (server)

`Understand & plan → Fetch platforms → Clean & load (SQL) → Bucket & label (LLM+SQL) →
SQL analysis → Synthesize report`

- **Fetch**: parallel, health-ordered provider ladders per platform. A failing API is skipped
  fast (per-provider timeouts), its failure is recorded in a persistent ledger
  (`.insight-extractor/health.json`) and the next provider takes its shard; 2+ failures sink a provider,
  successes promote it. Reddit routes in parallel (RSS www/old, PullPush, Redlib mirrors, Jina
  reader) so a single blocked route never blocks the channel.
- **Clean**: lexical relevance pre-filter + SQLite load; every SQL query is audited and visible
  in the SQL Audit tab.
- **Bucket**: LLM-defined buckets + single-pass corpus labeling (rule-based fallback).
- **Report**: grounded synthesis (evidence JSON only), or the deterministic template.

## API

| Route | Purpose |
|---|---|
| `POST /api/agent/stream` | SSE pipeline run (validates the full request body) |
| `GET  /api/sources/health` | sources, provider ladders, Gemini usage, run window |
| `GET  /api/runs` | the caller's run history (scoped by `x-insight-extractor-user`) |
| `GET  /api/runs/:id` | one stored run (owner only) |
| `POST /api/settings` | store any `UPPER_SNAKE_CASE` key server-side |

## Vercel notes

- Filesystem is ephemeral: health ledger, usage ledger, run window and history are per-instance
  (reset on redeploy). Keys set via ⚙ are per-instance too — set them as Vercel env vars for
  durability.
- `Deep Dive` runs can take 3–6 min; on the Hobby plan, long SSE streams may hit function
  duration limits — Rapid Scan is the safer default.
