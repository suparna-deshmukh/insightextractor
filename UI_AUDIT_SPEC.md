# Insight Extractor — Complete UI & User-Flow Specification (Design Audit Source Document)

> **Purpose of this document**
> Exhaustive, factual specification of the **current** Insight Extractor user interface: every
> screen state, every tab, every button, every layout rule, every colour, every interaction, and
> every end-to-end user journey. Extracted directly from the codebase on 2026-11-14 (files:
> `components/Studio.tsx` — the entire UI, 922 lines; `app/globals.css` — the entire design
> system, 389 lines; `app/*.tsx`, `app/api/*/route.ts`, `lib/pipeline.ts`, `lib/report.ts`,
> `lib/sources/*.ts`, `lib/store.ts`, `README.md`).
>
> Intended so a designer (or an AI working for one) can (a) rebuild a full mental model of the
> product without touching code, (b) generate a prompt that dramatically improves the visual
> design, and (c) audit every user flow and shorten it. Nothing here is an opinion — critique is
> the reader's job. Verified inconsistencies are listed in §10.

---

## 1. Product overview

**What it is.** Insight Extractor is a single-page **agentic user-insight research tool for
product managers**. The user types a topic, writes a description, picks from **8 live platform
sources**, configures scope and output — and an agent (Gemini-driven) plans the research, taps
the platforms **in parallel** with fallback provider ladders, cleans and dedupes records in
**SQLite**, buckets the signal with LLM + SQL, and emits a **fixed-format User Insights Report**
plus exportable artifacts (markdown, JSON, two CSVs).

**Built for** (the 5 selectable research objectives): problem discovery, product validation,
post-launch feedback, competitor teardowns, feature prioritization.

**Key platform facts**

| Fact | Value |
|---|---|
| Stack | Next.js 15 (App Router, TypeScript, `'use client'` React), no CSS framework — one hand-written `globals.css` |
| Run it | `npm install && npm run dev` → **http://localhost:3001**; deployed on Vercel (`.vercel/` present) |
| LLM | **Gemini only**. Key pool `GEMINI_API_KEY`, `_2`, `_3` (sticky primary-first rotation on error); per-key daily quota default **20**; model fallback chain `gemini-3.8-flash → 3.6-flash → 3.5-flash → 3.1-flash-lite`; **≤3 Gemini calls per run** (rapid = 1, raw-data = 2, standard = 3) |
| Budget UI | Shared across all users of the deployment; top bar shows `used/total shared gemini calls today`; ⚙ modal shows the per-key table (used/quota, remaining, `exhausted today` / `failed — retrying in Nm` / `live`) |
| Run limit | Per-user rolling window, default **5 runs / 5 h** (`RUNS_PER_WINDOW` / `RUN_WINDOW_HOURS`), shown in top bar, auto-refreshes (ChatGPT-style) |
| Identity | No login. A random uid is persisted in `localStorage["insight_extractor_uid"]` (legacy `askcard_uid` fallback) and sent as `x-insight-extractor-user`; run history is scoped per uid, stored as local JSON (`.insight-extractor/runs.json`) |
| Shared state | `lib/store.ts`: JSON files under `.insight-extractor/` locally, Redis via `INSIGHT_EXTRACTOR_REDIS_URL` on Vercel (multi-instance shared budget); fails open to local files |
| Resilience | Step-driven runs: each `POST /api/agent/step` executes exactly ONE of 6 pipeline stages, checkpoints to the store under a `runToken`; a dropped connection (Vercel function kill) is resumed by re-POSTing (≤3 drops tolerated; ≤6 model retries per step); a dropped run **refunds the run-slot** (`/api/agent/refund`) |
| Degradation | No Gemini key → **heuristic mode** (planning/bucketing/synthesis without LLM, flagged in UI); a failing platform provider is skipped fast and the next provider in the health-ordered ladder takes its shard; a run never fabricates (0 records + explicit gap note) |
| Footer disclaimer | "data is a public-discourse sample, not a census" |

**The 8 platforms** (source id → label → keyless? → key env var):

| id | Label | Icon | Key needed |
|---|---|---|---|
| `hn` | Hacker News | 🟠 | no |
| `reddit` | Reddit | 👽 | no (Gemini-driven multi-route channel) |
| `appstore` | App Store Reviews | 🍎 | no |
| `play` | Play Store Reviews | 🤖 | no |
| `github` | GitHub Issues | 🐙 | no |
| `google` | Google Autocomplete | 🔎 | no |
| `producthunt` | Product Hunt | 🦄 | `PRODUCTHUNT_API_TOKEN` (has keyless fallback route) |
| `youtube` | YouTube | ▶️ | `YOUTUBE_API_KEY` (has keyless fallback route) |

---

## 2. Architecture & rendering model

- **One page** (`app/page.tsx` → `<Studio/>`), **one React component** (`components/Studio.tsx`,
  922 lines) holds 100% of the UI state and markup. There is no router, no other pages, no
  login, no navigation other than the internal phase machine.
- **Phase machine** (top-level): `wizard` → `running` → `done` | `error`. `wizard` holds the
  4-step stepper; the other three phases share the **run view**.
- **Tabs** (results only): `report` | `buckets` | `evidence` | `sql`.
- **Polling**: `refreshMeta()` fetches `/api/sources/health` + `/api/runs` on mount and every
  **60 s** (also after every run, after key saves, after new-analysis). Health drives: top-bar
  pills, platform cards' live badges + provider ladders, review-step budget readouts, settings
  modal usage table.
- **Run execution (client)**: loop of `POST /api/agent/step` (JSON body = full `ClientRequest` +
  `runToken`), consuming an SSE-style stream (`data: {json}` lines, `\n\n`-separated). Event
  types: `stage` (index/total → stage tracker + "▸ stage" log), `log` (tone: info/ok/warn/error),
  `source` (per-platform live count/warning), `step_done` ("Checkpoint saved — next stage
  starting…"), `step_retry` (auto model retry, counted 1/6), `result` (full RunResult → phase
  done), `error`. Network drop mid-stream: warn log "Connection dropped — resuming the run from
  its checkpoint (N/3)…" and re-POST after **1.5 s**; 3 drops → error phase + slot refund.
  Server `step_retry` > 6 → error phase + slot refund ("The model kept failing across retries —
  your slot was refunded…").
- **Markdown.tsx** (77 lines): tiny client-side renderer (h1–h3, p, ul/ol, blockquote, table,
  code, hr) used for the Report tab.
- **Console auto-scrolls** to bottom on new log lines; blinking `▍` cursor line while running.
- **Toast**: single global bottom-center toast (2–2.2 s auto-clear).
- **Settings**: one modal (⚙ in top bar); keys are POSTed server-side, never returned (masked
  `abcd…xyz` only).

---

## 3. Design system (exact values from `app/globals.css`)

### 3.1 Colour tokens (dark theme — CSS custom properties on `:root`)

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#07090f` | page background (near-black) |
| `--bg-2` | `#0b0e17` | inputs, cards-in-cards, modal bg, history items |
| `--panel` | `rgba(255,255,255,0.03)` | card background, chips, pills |
| `--panel-2` | `rgba(255,255,255,0.05)` | buttons (default), selected tabs, md table headers, src-badge |
| `--border` | `rgba(255,255,255,0.08)` | default borders |
| `--border-2` | `rgba(255,255,255,0.14)` | hover borders, modal border |
| `--text` | `#e8ecf4` | primary text |
| `--text-dim` | `#9aa4b8` | secondary text (labels, descriptions, table cells) |
| `--text-faint` | `#6b7488` | tertiary/muted, hints, timestamps |
| `--accent` | `#6d7cff` | indigo accent (selections, focus, md blockquote bar) |
| `--accent-2` | `#22d3ee` | cyan accent (links, stage lines, edit links, sql tags) |
| `--grad` | `linear-gradient(135deg, #6d7cff 0%, #22d3ee 100%)` | logo mark, primary button, active step numbers, platform check, bars, hero gradient text |
| `--ok` | `#34d399` | success/green (status dots, counts, done marks) |
| `--warn` | `#fbbf24` | warnings/amber (dots, "key needed" badge, heuristic warning) |
| `--err` | `#f87171` | errors/red |
| `--radius` | `14px` | card/console radius |
| `--mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | console, provider ladders, sql code |

**Hard-coded extras used in JS/CSS:**

| Where | Value |
|---|---|
| Page ambient glow (`body::before`, fixed, z -1) | `radial-gradient(900px 500px at 85% -10%, rgba(109,124,255,0.13), transparent 60%), radial-gradient(700px 400px at -10% 30%, rgba(34,211,238,0.08), transparent 60%)` over `--bg` |
| Selected platform card (`.plat.sel`) | border `rgba(34,211,238,0.55)`, bg `rgba(34,211,238,0.07)`, ring `0 0 0 1px rgba(34,211,238,0.25)` + soft shadow — **cyan** (differs from the indigo used by every other selected state) |
| Selected pick/mode/fchip/toggle | border `rgba(109,124,255,0.65)`, bg `rgba(109,124,255,0.10–0.14)` (indigo) |
| Active stepper / active stage-pill | border `rgba(109,124,255,0.55/0.5)`, bg `rgba(109,124,255,0.10–0.12)` |
| Done marks (stepper, stages) | `rgba(52,211,153,0.18–0.2)` bg + `--ok` text |
| `.btn.primary` shadow | `0 6px 22px rgba(109,124,255,0.35)` (hover: translateY(-1px) + `0 9px 26px …0.45`) |
| Logo mark shadow | `0 4px 18px rgba(109,124,255,0.4)` |
| Status dot glow | `box-shadow: 0 0 8px var(--ok)` (amber: `0 0 8px var(--warn)`) |
| Kind badges (bucket cards) | default: `rgba(109,124,255,0.14)`/`--accent`; `pain`: `rgba(248,113,113,0.13)`/`--err`; `praise`: `rgba(52,211,153,0.13)`/`--ok`; `feature-request`: `rgba(34,211,238,0.13)`/`--accent-2` |
| Sentiment dots | positive `--ok`, negative `--err`, neutral `rgba(255,255,255,0.25)` |
| Error box | border `rgba(248,113,113,0.4)`, bg `rgba(248,113,113,0.07)`, text `--err` |
| Console bg | `#05070c` (darker than page) |
| Raw-CSV export button (inline style) | bg `var(--accent, #2563eb)`, white text |
| Modal backdrop | `rgba(3,5,10,0.7)` + blur 4 px |

### 3.2 Typography

- Base: **15 px**, line-height **1.55**, system stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto`), antialiased.
- Hero `<h1>`: `clamp(30px, 4.4vw, 46px)` / 800 / letter-spacing -.03em / line-height 1.12; part of it is gradient-clipped text (`.grad`).
- Hero sub `<p>`: 16 px, `--text-dim`, max-width 640 px, centered.
- Card `<h2>`: 18 px; `.sub`: 13.5 px `--text-faint`.
- Labels: 13 px / 600 / `--text-dim`, letter-spacing .02em.
- `.hint`: 12 px `--text-faint` (bold span inside hint = `--warn`).
- Run-head `<h1>`: 24 px / -.02em.
- Console: monospace 12.3 px, line-height 1.65; stage lines `--accent-2` 600.
- Markdown report: 14.5 px / 1.65; h1 21 px, h2 16 px (white, bottom border), h3 14.5 px; table 13 px.
- Table `.data`: 12.8 px; `th` 11 px uppercase ls .08em.
- Chips/pills: 12.5 px. Provider ladder text: mono 11 px.

### 3.3 Layout geometry

| Element | Geometry |
|---|---|
| `.shell` | max-width **1180 px**, centered, padding `0 28px 90px` |
| `.topbar` | sticky, z-50, `rgba(7,9,15,0.72)` + blur 14 px, 1 px bottom border; inner row max-width 1180, padding `14px 28px`, gap 14 px |
| Logo | 30 px gradient square "I" (radius 9, dark letter `#0a0c12` 800) + wordmark 17 px/700 + uppercase 12.5 px ls .14em sub "AGENTIC RESEARCH FOR PMS" |
| `.hero` | padding `54px 0 8px`, centered text |
| `.stepper` | centered flex, gap 8 px, margin `34px 0 26px`, wraps; pill buttons (8 px 16 px, radius 999) with 20 px number circles |
| `.card` | `--panel` bg, 1 px border, radius 14 px, **padding 26 px**, margin-bottom 18 px |
| `.obj-grid` / `.mode-grid` | `auto-fill, minmax(210px/230px, 1fr)`, gap 10/12 px |
| `.plat-grid` | `auto-fill, minmax(250px, 1fr)`, gap 12 px |
| `.review-grid` | 2 equal columns, gap 14 px (no responsive collapse) |
| `.run-grid` | **400 px** console column + `1fr` board, gap 18 px; collapses to 1 col @≤980 px |
| `.console` | fixed height **560 px**, own scroll; head 10 px 14 px uppercase 12 px |
| `.src-grid` (live intake) | `auto-fill, minmax(150px, 1fr)`, gap 9 px |
| `.modal` | max-width **480 px**, radius 16 px, padding 24 px, centered |
| Media queries | only one: `@media (max-width: 980px)` → run-grid single column |

### 3.4 Component inventory

- **Pill (top-bar status)**: 12.5 px, 1 px border, radius 999, `--panel` bg; 8 px `.dot`
  (green glow / `.amber` warning glow).
- **Chip** (hero + run-head): same pill style.
- **icon-btn**: 36 × 36 px, radius 10, panel bg, border (⚙).
- **btn**: radius 11 px, padding `11px 22px`, 14.5 px/600, `--panel-2` bg, 1 px border;
  `.primary` = gradient bg, **dark text `#0a0c12`**, glow shadow, hover lifts; `.ghost`
  transparent; `.small` = 8 px 15 px / 13 px / radius 9.
- **pick card** (objectives): 12 px radius, 12 px 14 px pad; title 14 px/600 (white when
  selected), desc 12.5 px faint.
- **mode-card** (formats/modes/lengths/tones): 13 px radius, 16 px pad; title 15 px/650;
  desc 12.5 px; `.spec` bullet list 11.5 px faint.
- **plat card**: 13 px radius, 14 px 15 px pad, flex with 22 px emoji icon; title 14.5 px/650 +
  10 px uppercase **badge** (`live`/`offline` green = keyless readiness; `key set` green;
  `key needed` amber); tagline 12.5 px faint; **provider ladder** in mono 11 px — providers
  joined with ` › `, each coloured: gray + "(no key)" if key missing, red + "N F" if ≥2
  failures, amber + "1 F" if 1 failure, green + " ok" / " new" otherwise; 18 px circular ✓
  check top-right (gradient-filled when selected); hover: translateY(-1px).
- **plat-detail** (key rows under a selected keyed platform): dashed border box, per key:
  label (180 px, 12.5 px/600) + password input (flex 2) + status ("key set ✓" green / "no key
  — other providers still work" faint); saved **on blur**.
- **pill-btn** (time-frame presets): 9 px 18 px pills; selected = indigo.
- **fchip** (focus areas): 999 pills; selected indigo.
- **toggle-row** (competitor comparison): full-width bordered row with 20 px rounded checkbox;
  whole row is clickable. ⚠ The `.sel` CSS variant exists but the JSX never applies it (§10 #2).
- **review-item**: bordered box; 11 px uppercase label; value 14 px; tiny **"edit"** link
  (11 px, `--accent-2`, absolute top-right, underline on hover) that jumps to the owning step.
- **hist-item**: full-width row button; topic 600 + meta 12 px faint; hover: indigo border +
  translateX(2px).
- **stage-pill**: 999 pill with 18 px number circle; active = indigo + pulsing gradient number
  (`@keyframes pulse` 1.2 s); done = green ✓.
- **console**: dark `#05070c` panel; lines `HH:MM:SS` (faint) + text; tones: info `--text-dim`,
  ok green, warn amber, error red, **stage cyan bold**; fadein animation per line.
- **src-chip**: 11 px 12 px card; pending = opacity .55 "waiting…"; done: "N records" green or
  "⚠ warning" amber.
- **waiting state**: dashed border box, 40 px pad, centered, 30 px ⌬ glyph pulsing (1.6 s) +
  "The agent is working — watch the console. Results render here the moment the pipeline
  finishes."
- **tabs** (results): 8 px 16 px, radius 9; selected = `--panel-2` bg + border-2.
- **bucket-card**: 13 px radius; head row (name 15 px/650 + kind-badge + right-aligned meta
  "N records · P% · avg score X"); description 12.5 px; **share bar** (8 px, gradient fill,
  width `min(100, share×2)%`); **sentiment stacked bar** (6 px, max-width 320 px: green/red/
  white-15) + 11.5 px legend ("● N positive · ● N negative · ● N neutral" + right-aligned
  per-source counts); up to **2 quotes** (13 px, left border 2 px, panel bg; attribution 11.5 px
  with "source ↗" link).
- **data table** (evidence): bordered wrap, radius 14; th 11 px uppercase; row hover
  `rgba(255,255,255,0.02)`; src-badge 10.5 px; sent-dot 8 px.
- **sql-entry**: bordered box; header row (cyan uppercase **stage tag** + "N rows"), mono 12 px
  SQL (word-break), optional 12 px summary.
- **error-box / toast / usage-table / modal** as specified above.

---

## 4. Screen-by-screen specification

The app is **one screen** with two major views. Layout stack (always, top to bottom):
**topbar → (wizard view | run view) → footer-note → (settings modal) → (toast)**.

### 4.1 Topbar (persistent, both views)

Left: logo block (30 px gradient "I" mark + "Insight Extractor" + uppercase sub
"Agentic Research for PMs"). Right (`.topbar-right`, gap 12 px) — **up to 4 items**:

1. **Gemini usage pill** (only when ≥1 key exists): status dot (green, amber when 0 left) +
   `◆ {used}/{total} shared gemini calls today`. Tooltip lists every key:
   `GEMINI_API_KEY: 20/20 (exhausted today)` etc. + "Shared across all users of this deployment.
   Failed keys are remembered for the day — the next run automatically starts with the next
   healthy key."
2. **Run-window pill** (only when health loaded): `▶ {limit-used}/{limit} runs left · resets
   {HH:MM}` (tooltip: "Per-user limit: agent runs per rolling window (auto-refreshes)").
3. **Gemini status pill**: green dot + `Gemini · {model}` or amber dot +
   `No Gemini key — heuristic fallback`.
4. **⚙ icon button** (36 px, title "API keys & usage") → opens Settings modal.

### 4.2 Wizard view (`phase === 'wizard'`)

**A. Hero** (centered):
- H1: "Type a topic. The agent taps **every platform.** (gradient) / You get user insights."
- Sub: "An agentic extractor plans the research from your description, pulls live reviews &
  feedback from the platforms you choose, buckets the signal with LLM + SQL, and hands a product
  manager a fixed-format insight report — on a strict ≤3 Gemini-calls-per-run budget."
- 4 chips: `🧠 1 call plans everything` · `📡 8 live platform APIs` · `🗄 SQL cleaning &
  aggregation` · `📊 Bucketed user insights`.

**B. Stepper** (4 pill buttons, centered): `1 Topic` · `2 Platforms` · `3 Refine & output` ·
`4 Review`. Current = active (indigo, gradient number); completed = ✓ (green circle, **clickable
to go back**); future = disabled (opacity .45).

**C. Step card** — one `.card` per step (h2 + `.sub` + fields). Details:

**Step 0 — "What are you researching?"** (sub: "The agent reads this and plans every fetch. The
more specific you are, the sharper the extraction.")
1. **Topic name** — text input (placeholder "e.g. Meal-kit delivery in India") + hint "Short
   name — used as the report title." Validation: min 3 chars ("Give your topic a short name (min
   3 characters).")
2. **Detailed description** — textarea (long placeholder: "What is the product or problem? Who
   is it for? What do you already believe? What would change your mind? E.g. "We are evaluating
   whether to build a B2B meal-kit service for office cafeterias in Bengaluru and Mumbai. We care
   about price sensitivity, delivery reliability complaints, and what people complain about with
   existing players…") + right-aligned **char-count** "N/30 min characters" (green at ≥30).
   Validation: min 30 chars ("Describe the topic in at least 30 characters — the agent plans its
   extraction from this text.")
3. **What is this research for?** — 5 **objective pick cards** (auto-fill grid ≥210 px):
   - Problem discovery — "Find what real people struggle with in this space before you build."
   - Product validation — "Is there demand for this product? What would make people pay?"
   - Post-launch feedback — "We shipped it. What are users praising, hating and requesting?"
   - Competitor teardown — "Where do competitors hurt? What do users switch over and why?"
   - Feature prioritization — "Rank what to build next using frequency + intensity of asks."
   (Default: Problem discovery.)
4. **Industry** — select (optional; 38 options: SaaS, E-commerce, Fintech, Healthtech, Edtech,
   DevTools, AI / ML, Consumer, Travel, Real Estate, Gaming, Media & Entertainment, HR / Talent,
   Logistics, Cybersecurity, Marketing, Legal, Construction, Agriculture, Hospitality,
   Automotive, Retail, Food & Beverage, Fashion, Sports & Fitness, Pets, Beauty, Home & Garden,
   B2B Services, Insurance, Telecom, Energy, Manufacturing, Non-profit, Government, Research /
   Academia, Healthcare, Other) + "Select (optional — sharpens planning & report framing)".
5. **Target audience** — select (optional; 28 options: B2B SaaS buyers, Startups, Enterprises,
   SMBs, Developers, Designers, Marketers, Product managers, Data analysts, Students, Teachers,
   Parents, Seniors, Gen Z, Millennials, Professionals, Remote workers, Freelancers, Creators,
   Healthcare workers, Finance professionals, Shoppers, Tech-savvy users, Budget-conscious,
   Luxury buyers, Ops teams, Other).
6. **Competitors / known players (optional)** — text input (placeholder "Comma-separated, e.g.
   Eat.fit, Farmley, HelloFresh") + hint "The agent mines reviews for these and tracks mention
   framing."
7. *(Conditional — "app signal": regex `/app|apps|application|ios|android|iphone|mobile|play
   store|app store/i` on topic+description)* **App names to mine (App Store + Play Store)** —
   comma input (max 6) + hint "Detected mobile-app topic — these apps will be mined for store
   reviews (verified against live stores at fetch time)."
8. *(Conditional — "brand signal": regex `/brand|saas|b2b|b2c|startup|company|product
   line|platform/i` OR industry in [SaaS, B2B Services, Fintech, E-commerce, DevTools])*
   **Brand / product line** — text input (placeholder "e.g. EatFit — or your own brand if
   evaluating the space") + hint "Detected brand/SaaS topic — the agent focuses signal on this
   line."

**Step 1 — "Which platforms should the agent tap into?"** (sub: "Each platform is a live API
with its own fallback ladder. Pick the ones you want tapped — the global time frame above
applies to all of them.")
1. **Global time frame** — 6 pill buttons: `Last 7 days` `Last 30 days` (default) `Last 90
   days` `Last 1 year` `All time` `Custom range…`; custom reveals **From/To date inputs** (max =
   today). Validation: custom needs both dates, start ≤ end, start not in future.
2. **Search platforms** — text filter input (placeholder "e.g. hacker, reddit, app, review…";
   filters label or tagline).
3. **Platform grid** — one **plat card per source** (all 8, order: HN, Reddit, App Store, Play
   Store, GitHub, Google, Product Hunt, YouTube). Each card (see §3.4 for styling): emoji icon,
   label + live badge, tagline, and the **live provider fallback ladder** (mono) with per-
   provider health. Taglines (exact):
   - HN: "Dev & product discourse — stories, arguments, launch feedback" — ladder: `Algolia
     (stories) › Algolia (stories+comments) › Web search (site: filter)`
   - Reddit: "Raw user sentiment — master-plan brief, multi-route fan-out, client-side audit" —
     ladder: `Reddit RSS (www) › Reddit RSS (old) › PullPush archive › Redlib mirrors › Jina
     reader`
   - App Store: "Star ratings + written reviews for iOS apps in the space" — ladder: `iTunes
     JSON review feed › iTunes Atom review feed`
   - Play Store: "Star ratings + written reviews for Android apps in the space" — ladder: `Play
     Store Reviews (google-play-scraper) › Play Store RPC (batchexecute) › Play Store page
     scrape`
   - GitHub: "Bug reports, feature requests and dev complaints for open-source tooling" —
     ladder: `Search API (issues, date-filtered) › Search API (issues, broad window) › Top
     repos issue feed`
   - Google: "Live search-demand signal: how people phrase this topic right now" — ladder:
     `Google Suggest (firefox) › Google Suggest (chrome) › DDG related topics`
   - Product Hunt: "Launch-day feedback, hunter notes and maker Q&A" — **key needed**
     (`PRODUCTHUNT_API_TOKEN`, hint "PH developer API token (v2)") — ladder: `PH GraphQL API
     (token) › PH frontend data`
   - YouTube: "Video reviews, comparisons and comment sentiment" — **key needed**
     (`YOUTUBE_API_KEY`, hint "YouTube Data API v3 key") — ladder: `YouTube Data API v3 (key) ›
     Invidious public instances`
   When a **keyed** platform is selected, a **dashed key panel** expands under the card: one row
   per required key (label + password input + status); typing a key saves it on **blur**
   (toast "KEY saved"). Statuses: "key set ✓" / "no key — other providers still work".
4. Empty-selection message: "Select at least one platform." (err-msg)

**Step 2 — "Refine scope & choose the output"** (sub: "Everything here sharpens the plan and
decides exactly what you receive.")
1. **Extra keywords (optional, comma-separated)** — input (placeholder "e.g. delivery delays,
   subscription pricing") + hint "Merged into the agent's search plan on top of what it derives
   from your description." (max 10 kept)
2. **Focus areas (optional — tap to toggle)** — 8 **fchips**: `Features & gaps` `Pricing &
   monetization` `UX & usability` `Performance & reliability` `Security & privacy` `Support &
   onboarding` `Integrations` `Marketing & positioning`.
3. *(Only if competitors were entered in step 0)* **Compare competitors toggle-row**: checkbox +
   "Compare competitors in the report — adds a dedicated COMPETITOR COMPARISON section for
   {comma list}." (whole row clickable).
4. **Output format** — 5 **mode-cards**:
   - PM One-Pager — "Fixed 9-section User Insights report. A PM finishes it in 4 minutes.
     Recommended." (default)
   - Executive Brief — "A VP 90-second read: key findings, what it means, top-3 recommendations."
   - Full Research Report — "One-pager + hypothesis checks, competitor mentions and methodology
     appendix."
   - Data-First — "Minimal prose, maximum data: JSON + CSV exports are the primary artifact."
   - Raw Data — "No synthesis: a CSV of the raw relevant insights (bucket, sentiment, full text,
     source links) is the artifact. Skips the 3rd Gemini call."
5. **Analysis pipeline** — 2 **mode-cards** with icon + spec bullets:
   - ⚡ Rapid Scan — "Fast pass for a quick read on the terrain. Fewer records, single labeling
     pass." — `• ~1–2 min typical • up to ~400 records • 4 insight buckets • ≤3 Gemini calls`
     (default)
   - 🔬 Deep Dive — "Full research pass: wider fetch, full corpus labeling, full SQL analysis."
     — `• ~3–6 min typical • up to ~900 records • 6 insight buckets • ≤3 Gemini calls (larger
     payloads)`
6. **Report length** — 3 **mode-cards**: Concise — "Cut ~40%: 3 bullets/section, max 3 recs." /
   Standard (default) — "Balanced depth for a working PM." / Detailed — "Expanded: 6
   bullets/section, 5 recs, more quotes."
7. **Tone** — 3 **mode-cards**: Formal — "Executive, zero filler, no contractions." / Neutral
   (default) — "Neutral professional." / Conversational — "Plain-spoken, contractions fine,
   data-first."
8. **Configuration recap hint** (13 px, dynamic): "Next steps with this configuration: Gemini
   **plans** (1 call) → **fetch** N platforms in parallel over {timeframe} (all share this time
   frame) → **clean & load** into SQLite → **label** up to 400|900 records in one pass (2nd
   call) → **SQL analysis** → **synthesize** a {Format} (3rd call)." — for Raw Data: "…emit a
   **raw CSV** of the relevant insights (3rd call skipped — the CSV is the artifact)."

**Step 3 — "Review & run"** (sub: "Confirm the brief, then launch the agent. This run uses at
most 3 Gemini API calls.")
- **Review grid** (2 cols) — 11–13 **review-items**, each with an **"edit" link** jumping to the
  owning step:
  | Item | Shown | Edit → |
  |---|---|---|
  | Topic | topic or "—" | step 0 |
  | Objective | objective label | step 0 |
  | Industry / Audience | "industry · audience" or "—" | step 0 |
  | Competitors | list + " (compared in report)" if toggle on | step 0 |
  | Apps to mine *(conditional)* | app list | step 0 |
  | Brand / line *(conditional)* | brand | step 0 |
  | Platforms | comma list or "—" | step 1 |
  | Time frame | "{tf} (applies to every selected platform)" | step 1 |
  | Keywords / Focus | keywords + " · focus areas" | step 2 |
  | Output | "{Format} · {length} · {tone}" | step 2 |
  | Pipeline | mode label | step 2 |
  | Gemini budget (no edit) | "N of M shared calls left today · this run ≤ 3" or "No Gemini keys set — heuristic mode" | — |
  | Run window (no edit) | "N of M runs left · resets HH:MM" or "—" | — |
- Heuristic warning (amber err-msg) when no Gemini key: "Heuristic mode: planning, bucketing and
  synthesis run without Gemini. Add your key(s) in ⚙ Settings for the full experience."

**D. History card** (only when the user has past runs): h2 "History" + sub "Your past runs on
this device — click one to open its full report, buckets and evidence." + up to **10
hist-items**: bold topic + meta `{timeAgo} · {n} platforms · {kept} records · {s}s · {format}`.
Clicking loads that run (phase → done, tab → report, console seeded with "Loaded from history —
{topic} ({kept} records, {s}s).").

**E. Nav row** (bottom of wizard): **"← Back"** (ghost; disabled on step 0) + primary
**"Continue →"** (steps 0–2) or **"🚀 Run the agent"** (step 3). Step validation errors render
right-aligned under the row (err-msg): "Give your topic a short name (min 3 characters)." /
"Describe the topic in at least 30 characters — the agent plans its extraction from this text."
/ "Select at least one platform." / "Custom range needs both start and end dates." / "Start
date must be on or before end date." / "Start date cannot be in the future."

### 4.3 Run view (`phase` = running | done | error)

**A. Run head**: h1 = topic + 4 chips: `{n} platforms` · `{timeframe}` · `{mode label}` ·
`{format label}` (loaded from the request — for history-loaded runs these reflect the saved
request).

**B. Stage tracker** — 6 **stage-pills**: `Understand & plan` · `Fetch platforms` · `Clean &
load` · `Bucket & label` · `SQL analysis` · `Report`. Numbered circles; active = indigo +
pulsing; done = green ✓; all green when finished.

**C. Run grid** — left column (400 px): **Agent console** (560 px fixed height):
- Head: "Agent console" (uppercase) + right: `● live` while running / `finished`.
- Body (mono, auto-scroll): each line `HH:MM:SS` + text, tone-coloured. Typical lines:
  "Agent booting — N platforms, {tf}, Rapid Scan." / "Gemini budget for this run: ≤3 calls
  (master plan → label corpus → report)." / "— Understand & plan —" / "▸ Fetch platforms" /
  per-source fetch logs / "Understand & plan ✓ gemini-3.8-flash via GEMINI_API_KEY (1 shared
  call used)" / quota errors ("…hit its daily limit — recorded 20/20 (fully utilized) and
  refused until Pacific midnight; switching key…") / "Checkpoint saved — next stage
  starting…" / "Model hiccup — this step will retry on its own (1/6)…" / "Connection dropped —
  resuming the run from its checkpoint (1/3)…" / "Done in Xs — N records across M platforms."
  while running: a live line with blinking `▍`.
- Right column (board):
  - **running**: dashed **waiting** box (⌬ pulsing + "The agent is working — watch the console.
    Results render here the moment the pipeline finishes.") + **"Live platform intake"** card:
    one **src-chip per selected platform** — pending: "waiting…" (55% opacity); done: "N
    records" (green) or "⚠ {warning}" (amber).
  - **error**: **error-box** "Run failed: {message}" + **"↻ Retry run"** + **"← Back to wizard"**
    (settings are kept).
  - **done**: the results block (§4.4).

### 4.4 Results block (`phase === 'done'`)

**A. Tabs** (4, with emoji): `📄 Report` (default) · `🧺 Buckets` · `🧾 Evidence` · `🗄 SQL
Audit`.

**B. Actions row** (always visible under tabs):
- **⧉ Copy markdown** (copies `result.report` to clipboard; toast "Report copied to clipboard")
- **⬇ .md** (downloads `insight_extractor_{topic}_insights.md`)
- **⬇ .json** (full RunResult JSON)
- **⬇ .csv (labeled evidence)** (columns: id, source, bucket, sentiment, score, date, author,
  title, url)
- **⬇ .csv — raw relevant insights** (accent-styled; **only present for Raw-Data format runs** —
  `result.rawCsv`)
- **＋ New analysis** (ghost, pushed right; resets to wizard step 0, clears result)

**C. Report tab** — card (slightly lighter bg) rendering `result.report` as markdown (h1 title,
h2 section headers with bottom borders, tables, blockquotes). The report is the fixed-format
document described in §8.

**D. Buckets tab** — one **bucket-card per insight bucket** (4 in Rapid, 6 in Deep): name,
kind-badge (pain / praise / feature-request / other — kind text dash→space), meta
"N records · P% · avg score X", description, share bar, sentiment stacked bar + legend
(positive/negative/neutral counts + right-aligned per-source breakdown "Hacker News 12 ·
Reddit 8 · …"), and up to **2 top quotes** (title+body truncated to 260 chars, attribution
"Source · author · date · source ↗" link).

**E. Evidence tab** — bordered **data table** of the first **80** labeled records:
`Source (badge) | Bucket (name) | Sent. (dot) | Evidence (title link or text, 110 chars) |
Score (tabular nums) | Date (faint)`.

**F. SQL Audit tab** — one **sql-entry per audited query**: cyan stage tag + "N rows", the full
SQL (mono, break-all), optional one-line summary.

### 4.5 Settings modal (⚙)

- Centered modal, max-width 480 px, backdrop blur.
- **h3**: "API keys & Gemini usage".
- **Sub** (12.5 px): "Stored server-side in `.env.local` + process memory. Keys are never sent
  to the client after saving. The Gemini budget is SHARED across all users of this deployment:
  the primary key serves every call, and we switch to the next key only when it errors — a quota
  failure records the key as fully utilized (e.g. 20/20) and refuses it until the next Pacific
  midnight (when Google resets the free tier). No status-probe queries are ever sent."
- **Usage table** (only when keys exist): `Key | Used today | Remaining | Status` — status:
  "exhausted today" (red) / "failed — retrying in Nm" (red) / "live" (green).
- **Key fields** (each with masked "✓ set server-side: `abcd…xyz` — leave blank to keep, paste a
  value to replace." hint when set):
  1. Gemini API key #1 (placeholder "AIza…")
  2. Gemini API key #2 (rotates in automatically)
  3. Gemini API key #3 (rotates in automatically)
  4. Product Hunt token (optional) (placeholder "ph_…")
  5. YouTube Data API key (optional)
  6. "Any other API key (optional — name + value, e.g. SERPAPI_KEY)" — name input (max 150 px,
     uppercased) + value input; hint "Stored server-side; provider ladders can reference any
     stored key."
- Message line (green ok): "Saved: KEY1, KEY2" or the error ("Paste at least one key." / "No
  valid keys (names must be UPPER_SNAKE_CASE).").
- Footer (right): **Close** (ghost small) + **Save keys** (primary small). Saving auto-closes
  after 900 ms and refreshes health.

### 4.6 Footer note (persistent)

Centered, 12.5 px faint: "Insight Extractor · agentic user-insight engine for product managers ·
live platform APIs + Gemini + SQLite · data is a public-discourse sample, not a census"

### 4.7 Toast (global)

Bottom-center, dark `#11151f` pill (10 px 18 px, radius 10, 13.5 px), auto-clears ~2 s. Used for:
"KEY saved", key save failures, "Run not found", "Could not load that run", "Report copied to
clipboard".

---

## 5. The 6 pipeline stages (what the user watches)

`Understand & plan → Fetch platforms → Clean & load (SQL) → Bucket & label (LLM+SQL) → SQL
analysis → Synthesize report` (the tracker displays short labels; the UI console logs the full
names). Gemini call budget per stage: plan = 1 call, bucket/label = 1 call, report = 1 call
(skipped for Raw Data). Each stage degrades to a non-LLM fallback when budget is exhausted —
"the run never fails hard and never fabricates (0 records + an explicit gap note)".

- **Understand & plan**: Gemini produces the plan: keywords, per-platform queries (hn, github…),
  apps to mine (name + stores), subreddits, lookFor list, hypotheses. Heuristic fallback derives
  a deterministic plan from the brief.
- **Fetch platforms**: parallel, health-ordered provider ladders per platform (shard fan-out,
  fast per-provider timeouts); Reddit runs a Gemini-driven multi-route channel with a
  client-side audit; failures recorded in the persistent health ledger
  (`.insight-extractor/health.json`): 2+ failures sink a provider, successes promote it.
- **Clean & load**: lexical relevance pre-filter + SQLite load; empty corpus → early exit with
  an honest report.
- **Bucket & label**: LLM-defined insight buckets (4 rapid / 6 deep) + single-pass corpus
  labeling (rule-based fallback when no budget).
- **SQL analysis**: audited SQL queries (visible in the SQL Audit tab) — counts, shares, avg
  scores, sentiment splits, per-source breakdowns, trend series, top quotes.
- **Synthesize report**: grounded synthesis from evidence JSON only (or deterministic template
  in heuristic mode).

### The 9-section fixed report format (`lib/report.ts`)

`## 1. SNAPSHOT` · `## 2. TOP INSIGHT BUCKETS` · `## 3. WHAT USERS LOVE` · `## 4. WHAT USERS
HATE` · `## 5. UNMET NEEDS & FEATURE REQUESTS` · `## 6. VOICE OF THE USER` · `## 7. MOMENTUM &
TRENDS` · `## 8. RECOMMENDATIONS` · `## 9. METHOD & DATA APPENDIX`. Full Research Report adds
hypothesis checks, competitor mentions and a methodology appendix; a `## DATA NOTE` is appended
when data gaps exist (empty sources, heuristic mode).

---

## 6. Gemini budget & key rotation (as surfaced in the UI)

- Sticky primary-first: `GEMINI_API_KEY` serves every call; `_2` only after the primary
  **errors**. No load balancing, **no status-probe queries** (the ledger knows which key to
  start with).
- 429 / "quota exceeded" → key recorded as fully utilized (e.g. 20/20), **refused until the next
  Pacific midnight**; transient failures → 30-minute "unwell" cooldown remembered platform-wide
  (visible as "failed — retrying in Nm").
- 503 "high demand" → next **model on the same key** (model fallback chain 3.8-flash → 3.6-flash
  → 3.5-flash → 3.1-flash-lite); model issues don't burn other keys' quota.
- Every outbound request is recorded in the shared per-key/per-UTC-day ledger (free tier has no
  usage API). Top bar + ⚙ table read from it.
- Per-user run window (default 5 runs / 5 h rolling) — a dropped or hard-failed run **refunds
  the slot** (client reports via `/api/agent/refund`; one-shot server marker).

---

## 7. Data model (client-facing types)

- **HealthView**: `gemini: bool`, `model`, `sources: SourceInfo[]` (id, label, icon, tagline,
  keyless, ready, keyHint, `providers: {id, name, keyless, keySet, requiresKey?, fails,
  successes, lastError?}`), `usage: {day, keys: {name, used, quota, exhausted, remaining,
  cooldownUntil?}[], totalUsed, totalQuota}`, `runWindow: {ok, used, limit, resetsAt}`.
- **RunSummary** (history rows): id, ts, topic, objective, platforms[], keptRecords, durationMs,
  format, mode.
- **RunResult** (the artifact): topic, description, objective, `plan` (keywords, per-platform
  queries, apps, subreddits, lookFor, hypotheses), totalRecords, keptRecords, irrelevantDropped,
  `perSource` (fetched/kept/warning), `buckets` (bucket {id, name, description, kind} + count,
  share, avgScore, positive/negative/neutral, bySource, topQuotes), `trend` (date/count),
  `labeled[]` (id, source, title, body, url, author, date, score, bucket, sentiment,
  relevance), `rawCsv`, `sqlAudit` (stage, sql, rows, summary), `report` (markdown), model,
  usedLlm, durationMs.
- **ClientRequest** (the run config): topic, description, objective, competitors[], industry,
  audience, keywords[], focusAreas[], compareCompetitors, reportLength, tone, appsHint[],
  brandHint, platforms[], timeframes {default preset/start/end, overrides}, format, mode.
- Storage: `.insight-extractor/` — `runs.json` (per-uid run history, local), `health.json`
  (provider ladder ledger), usage ledgers (`*usage:<day>:<key>`), window/slot markers,
  per-uid run checkpoints (`ie:runstate:*`); Redis mirrors the shared counters on Vercel.
- **API surface**:
  - `POST /api/agent/stream` — legacy SSE single-stream run (validates full body)
  - `POST /api/agent/step` — step-driven run: one stage per POST, checkpointed per runToken
  - `POST /api/agent/refund` — refund a run slot on mid-run drop (token one-shot)
  - `GET /api/sources/health` — health view (per-uid)
  - `GET /api/runs` — caller's run history (via `x-insight-extractor-user`)
  - `GET /api/runs/:id` — one stored run (owner only)
  - `GET|POST /api/settings` — list masked keys / store UPPER_SNAKE_CASE keys server-side
    (blocked names: PATH, HOME, PWD, NODE_ENV, NODE_OPTIONS, PORT, HOSTNAME)

---

## 8. End-to-end user journeys (current state)

**J1 — First use, no keys (heuristic)**
1. `npm run dev` → http://localhost:3001. Top bar shows amber "No Gemini key — heuristic
   fallback".
2. Wizard: topic + 30-char description → Continue (validation) → pick ≥1 platform (+ time frame)
   → Continue → tweak output (defaults: PM One-Pager / Rapid Scan / Standard / Neutral) →
   Continue → Review (budget line says "No Gemini keys set — heuristic mode" + amber warning).
3. 🚀 Run the agent → console boots, 6 stages, heuristic plan/fetch/bucket/synthesize →
   results: 4 tabs + 4 export buttons (no raw CSV button).
4. Optional: ⚙ → paste Gemini key(s) → future runs use LLM.

**J2 — First use, with keys**
1. ⚙ → paste GEMINI_API_KEY (+ optional _2/_3, PH token, YT key) → Save keys (auto-close,
   health refresh; usage table appears; top bar pill `◆ 0/20 shared gemini calls today`).
2. J1 steps 2–3 with Gemini: console logs model + key per stage; "1 shared call used" lines.
3. Any stage quota-error → console explains key exhaustion + switch; run still completes.

**J3 — Mining app-store reviews (app-signal flow)**
1. Step 0: topic/description containing "app"/"mobile" (or iOS/Android) → **App names to mine**
   field auto-appears → add up to 6 exact app names.
2. Step 1: select App Store / Play Store (+ others). At fetch time each app is resolved via live
   store search (iTunes search / Play search) — names that don't resolve are skipped honestly.
3. Reviews flow through the normal clean/bucket/report pipeline.

**J4 — Competitor teardown with comparison**
1. Step 0: objective = Competitor teardown; competitors input filled (enables the step-2
   toggle-row).
2. Step 2: enable "Compare competitors in the report" → adds a dedicated COMPETITOR COMPARISON
   section.
3. Run → report includes mention framing + comparison.

**J5 — Re-running from history**
1. History card (wizard view) → click a past run → results render instantly (phase done, report
   tab, console note "Loaded from history — …"); run-head chips reflect the saved request.
2. **＋ New analysis** → fresh wizard (previous config NOT carried over).

**J6 — Dropped / failed run recovery**
- Mid-run stream drop: console "Connection dropped — resuming… (1/3)" → auto re-POST from
  checkpoint (1.5 s). ≥3 drops → error phase: "Connection dropped mid-run (…) — your slot was
  refunded. Press Retry to re-run (settings are kept)." → **↻ Retry run**.
- Model repeatedly failing in one stage: "Model hiccup — this step will retry on its own
  (N/6)…" → >6: error + slot refund.
- Server error status: "Server error {status} — your slot was refunded…"
- **← Back to wizard** keeps all inputs; only the run slot and time are lost.

**J7 — Keyed-platform enablement from the wizard**
1. Step 1: select Product Hunt → dashed key panel → paste token → **blur saves it** (no Save
   button) → card badge flips to "key set", ladder entry goes green.
2. Same for YouTube (key), or any key via ⚙ (custom key name/value).

---

## 9. Flow-length census (neutral interaction counts, for the audit)

| Journey | Interactions (approx) |
|---|---|
| Empty state → completed run (defaults all the way) | topic + description (2) → Continue (1) → ≥1 platform (1) → Continue (1) → Continue (1, skip refine) → 🚀 Run (1) = **~7** |
| Full-config run (every step touched) | ~15–20 (topic, desc, objective, industry, audience, competitors, app names, brand, tf, platforms ×N, keywords, fchips ×N, compare toggle, format, mode, length, tone, review, run) |
| Re-run a past analysis | click history item (1) — config not editable in place |
| Re-run same config with changes | 1 (＋ New analysis) + re-enter everything (config not preserved across runs) |
| Save a platform key mid-wizard | paste + blur (1 action) |
| Save keys via ⚙ | open ⚙ + paste + Save keys (2) |
| Export report (done state) | 1 click per format (.md / .json / csv / raw csv / copy) |
| Retry a failed run | 1 click |
| Read evidence for one finding | Buckets tab → quote → external link (2) |
| Understand a bucket's composition | Buckets tab (1) + Evidence tab (1) + SQL Audit (1) |

**Facts that follow from the table (not verdicts):**
- The wizard is linear with per-step validation; going back requires the Back button or
  clicking a completed stepper step (future steps disabled).
- Config is **not persisted** after a run — "New analysis" starts blank; history reloads the
  saved request for *viewing* only (run-head chips come from the stored request, but the wizard
  itself is reset).
- The whole wizard + run view live in one scrollable column; the 400 px console + board grid is
  the only two-column layout (collapses ≤980 px).
- Step 2 (Refine) has **7 independent decisions** on one card; step 3 is read-only except edit
  links.
- No search/filter/sort on the Evidence table (first 80 rows only); no pagination anywhere.
- No share/URL state: refresh mid-wizard loses all inputs (no localStorage for the form).

---

## 10. Facts & inconsistencies found in the current code (verify before auditing)

1. **Two selection colours**: platform cards select in **cyan** (`rgba(34,211,238,…)`) while
   every other selectable (objectives, formats, modes, lengths, tones, fchips, pills, stepper,
   stages, toggles) selects in **indigo** (`rgba(109,124,255,…)`) — the only component whose
   selected state differs.
2. **Dead CSS**: `.toggle-row.sel` is defined but the JSX never applies the `sel` class — the
   competitor-comparison row's background/border never changes on toggle (only the inner ✓
   box does).
3. **Raw-CSV button style** is inline (`var(--accent, #2563eb)`) while every other button uses
   class-based styles; the fallback `#2563eb` never applies (accent is defined) but the button
   doesn't match the `.btn` family (no border-radius/padding variance visible in code — same
   `.btn.small`, different palette).
4. **Console height is fixed 560 px** with no resize, on all screens; on short viewports it
   forces the board content below the fold.
5. **Evidence tab silently caps at 80 rows** (`slice(0, 80)`) with no "showing 80 of N" note.
6. **Bucket share bar** is scaled `min(100, share × 2)` — a 50 % bucket fills the bar, a 25 %
   bucket looks half as big as its true share; no axis or caption explains the scaling.
7. **Stage names differ by surface**: tracker pills say "Clean & load" / "Bucket & label" /
   "Report"; the server STAGES constant says "Clean & load (SQL)" / "Bucket & label (LLM+SQL)" /
   "Synthesize report" (console logs show the long names).
8. **Top bar can hold 4 pills + icon button** with no wrap/overflow handling at narrow widths
   (no media query for the top bar).
9. **`describeTf` has a "default" case** ("Default") that no UI control can select (presets are
   7d/30d/90d/1y/all/custom) — dead branch.
10. **Health polling is 60 s** — provider ladder health, usage counters and run-window resets
    can look stale for up to a minute after a run; the run window "resets HH:MM" doesn't tick
    live.
11. **History is per-browser only** (localStorage uid + local JSON); on Vercel run history and
    the provider health ledger reset on redeploy (README states this; the UI never mentions it).
12. **No Gemini key** ⇒ heuristic mode, but the top-bar pill and the step-3 warning are the only
    cues; the hero still advertises "🧠 1 call plans everything".
13. **Key save on blur** in the wizard's platform panel has no explicit confirm/visible "saved"
    state on the field itself (only a 2.2 s toast); leaving the page with a typed-but-unblurred
    key discards it.
14. **`x-insight-extractor-user` uid is random per browser** — two devices = two "users" with
    separate run windows and histories; no account concept at all (by design, but invisible to
    the user).
15. **The `raw-data` format button text** says "Skips the 3rd Gemini call" while the step-2 recap
    hint phrases it as "(3rd call skipped — the CSV is the artifact)" — same fact, two
    phrasings; the budget line in Review still says "this run ≤ 3".
16. **Review step is read-only** — no way to change, e.g., the time frame without jumping back to
    step 1 and re-validating; edit links jump to step start, not field-level anchors.
17. **Step 1 time frame is global only** — the `ClientRequest` type carries `timeframes.
    overrides` (per-platform) but the UI never exposes per-platform overrides (the README
    mentions "per-platform time-frame overrides" as a feature).
18. **Search platforms input** filters the 8-card grid live but there is no "no results" empty
    state (grid simply empties).
19. **`loadRun` sets a single console line** but the stage tracker renders all-6 green
    (`phase === 'done'`) even though the loaded run's console shows nothing happened live.
20. **Error box has no details affordance** — long error messages (e.g. provider failures) are
    truncated to one line in the error state, while the full text lives only in the console.
21. **No "cancel run" action exists**: once running, the user can only wait for the pipeline to
    finish (or refresh the page — the client stops listening, but the server keeps checkpointing
    the run under its token, and nothing in the UI can reclaim or view that orphaned run).
22. **No focus-visible styling** beyond input border colour changes; keyboard navigation of the
    card-buttons (pick/mode/plat/fchip) uses native `<button>` focus rings only where the UA
    default survives.
23. **Font stack**: system fonts only; `Inter` is listed in the stack but never loaded.
24. **`app/layout.tsx`** has no viewport meta beyond Next defaults; the page is `force-dynamic`.

---

## 11. Quick reference: every button & control in the app (by label)

| Surface | Controls (exact labels) |
|---|---|
| Top bar | ⚙ (API keys & usage) |
| Hero | (no buttons) |
| Stepper | 1 Topic · 2 Platforms · 3 Refine & output · 4 Review (clickable when done) |
| Step 0 | 5 objective picks; Industry select; Audience select; Competitors input; (cond.) Apps input; (cond.) Brand input |
| Step 1 | 6 time-frame pills (+ From/To dates); Search platforms input; 8 platform cards (toggle); key rows (paste + blur-save) |
| Step 2 | Keywords input; 8 focus chips; (cond.) Compare competitors toggle-row; 5 format cards; 2 pipeline cards; 3 length cards; 3 tone cards |
| Step 3 | 13 review items with edit links (11 editable) |
| History | up to 10 history items (open run) |
| Wizard nav | ← Back · Continue → / 🚀 Run the agent |
| Run view | ↻ Retry run · ← Back to wizard (error only) |
| Results tabs | 📄 Report · 🧺 Buckets · 🧾 Evidence · 🗄 SQL Audit |
| Results actions | ⧉ Copy markdown · ⬇ .md · ⬇ .json · ⬇ .csv (labeled evidence) · (raw-data only) ⬇ .csv — raw relevant insights · ＋ New analysis |
| Settings modal | 5 key fields + custom key (name/value) · Close · Save keys |
| Console | (read-only) |

---

*End of specification. Source: `/Users/apple/insightextractor` — `components/Studio.tsx`
(922), `app/globals.css` (389), `components/Markdown.tsx` (77), 7 API route handlers,
`lib/pipeline.ts` (632), `lib/report.ts` (119), `lib/sources/*.ts` (1,358), `README.md` (186).
Re-verify any quoted copy against the files before quoting it back at the codebase.*
