# Insight Extractor

Type one question. Insight Extractor reads what real people say about it on public sites,
groups it into themes, and hands you a clear report with real quotes as proof.

Built for product decisions: problem discovery, product validation, post-launch feedback,
competitor comparisons, feature prioritization.

## System design

```
 App (browser)                       server (Next.js 15 routes)
 ┌──────────────────┐  POST /api/   ┌────────────────────────────────────────────┐
 │ question +       │  agent/step   │ agent loop: Gemini plans source batches →  │
 │ optional settings│ ────────────► │ parallel fetchers (Hacker News, Reddit,    │
 │ (sources, time,  │               │ App Store, Play Store, GitHub, Google      │
 │  depth, fine-    │               │ Trends, Product Hunt, YouTube)             │
 │  tune)           │               │  → clean + dedupe (SQL)                     │
 └──────────────────┘               │  → LLM bucketing (4 insight themes)       │
       ▲                            │  → fixed-format User Insights Report       │
       │ report + artifacts         └───────────────┬────────────────────────────┘
                                                    │
                       lib/store.ts — shared platform state
                       (Gemini call budget, user identity, run windows)
                       local: JSON under .insight-extractor/
                       Vercel: Redis/KV via INSIGHT_EXTRACTOR_REDIS_URL
```

- **Gemini only**: key pool `GEMINI_API_KEY`, `_2`, `_3` (rotate on quota failure);
  per-key daily quota (`GEMINI_DAILY_QUOTA`, default 20); model fallback chain
  `gemini-3.8-flash → 3.6-flash → 3.5-flash → 3.1-flash-lite`; ≤3 Gemini calls per run
  (rapid = 1, raw-data = 2, standard = 3).
- **State**: `lib/store.ts` is the only shared-state module — local JSON files on
  disk (single instance) or Redis (multi-instance). The Gemini budget is enforced
  platform-wide when a store is configured, never per instance.
- **Abuse guard**: `RUNS_PER_WINDOW` / `RUN_WINDOW_HOURS` rolling per-user run limit.
- **Degradation**: store unavailable → app keeps working (in-memory + local files);
  Google quota error → run completes with remaining sources and an honest health flag.
- **Vercel**: serverless + Redis; no local FS state is assumed in production.

## Run it

```bash
cd insightextractor
npm install
npm run dev          # http://localhost:3001
npm test             # vitest suite for the client logic
npm run typecheck    # tsc --noEmit
npm run lint         # banned-pattern checks
npm run build        # production build (then npm start)
```

Keys live in `.env.local` (or paste them in Settings in the UI — they persist to
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

## The app

One screen, one question. Everything else is optional, and can be changed later from a saved
research ("Edit and run again" prefills it).

```
/             Home — ask a question, start the research (?from={id} prefills from a past run)
/research/id  One page, four states: running, error, results (plus a not-found state)
/library      Your research — date groups, search, rename, remove with undo
/settings     AI key, usage, optional connections, appearance, data, source status
/sample       The results page rendered from built-in sample data (clearly marked)
/dev/ui       Component gallery — development only, 404 in production
```

- **Home** — the question, an optional "What is this research for?" choice, and three optional
  settings: **Where to look** (eight public sources, with automatic picks for app-related
  questions), **How far back** (time window) and **How thorough** (Quick scan or Deep dive).
  Fine-tune adds goal-specific fields (app names, competitors, keywords, report style). Two
  interactions get a result going: type the question, press Start research.
- **Running** — a plain-language step list that ticks as the work happens, with a status line.
  The full technical log is opt-in under "Show details". Cancel asks once; if confirmed, the
  research does not count against your limit. A refresh lands back on the same running research.
- **Results** — "The short version" first, then themes with real quotes and source links. The
  Insights tab holds the full report, a trend over the chosen window and per-theme detail; the
  Evidence tab lists the posts with filters (theme, source, feeling), search with highlighting,
  sorting and 50-row paging. "How was this made?" opens a drawer with the source table and, for
  analysts, the SQL. Export as `.md`, `.json` or `.csv` (spreadsheet-ready styles included).
- **Your research (library)** — every finished research in date groups (Today, Yesterday,
  Last 7 days, Last 30 days, Older), searchable, renamable in place, removable with a 7-second
  Undo. Stored in this browser only; the page says so.
- **Settings** — the Google AI key (plus two backup keys) with an explicit Save and a visible
  "Saved" confirmation, optional Product Hunt and YouTube keys, a usage meter with a live
  countdown to the next opening research, appearance (light / dark / match device), a plain
  data section, and source status under Advanced.

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
counts) and is cross-checked by server quota signals. Per-key usage (e.g. 20/20, exhausted)
is shown in Settings › AI connection; the sidebar meter shows researches left in the window.

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

Each user gets `RUNS_PER_WINDOW` researches per rolling `RUN_WINDOW_HOURS` window (default
5 / 5 h), shown as a meter in the sidebar with a live countdown — the same pattern as
ChatGPT/Claude. The limit counts **researches**, not volume.

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
  (reset on redeploy). Keys set via the Settings page are per-instance too — set them as Vercel env vars for
  durability.
- Deep dive researches can take 3–6 min; on the Hobby plan, long streams may hit function
  duration limits — quick scan is the safer default.
