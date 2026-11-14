# Insight Extractor — Redesign report

Executed per `INSIGHT_EXTRACTOR_REDESIGN_PLAN.md`, on branch `redesign`. Every phase ran the full
gate (`npm run typecheck && npm run lint && npm run test && npm run build`) and passed. The plan's
rules of engagement were followed: `app/api/**`, `lib/pipeline.ts`, `lib/sources/**`, `lib/store.ts`
and `lib/report.ts` were never modified; no dependencies were added after Phase 0.3; where the
code disagreed with the plan the code won and a `// PLAN-NOTE` marks it.

## What was built, per phase

- **Phase 0** — Codebase mapping notes, design-system folder scaffold, dependencies and test tooling (vitest, jsdom).
- **Phase 1** — Design tokens and base styles (`styles/tokens.css`, `styles/base.css`), layout with fonts, the pre-paint theme script, viewport and icon, the full copy deck in `lib/copy.ts`, and the UI kit (buttons, fields, badges, meters, states, dialogs, sheets, toasts, menus, highlights, skeletons, spinners).
- **Phase 2** — Theme provider, client stores (inflight, runmeta, draft) and form logic with tests, SWR health/usage hooks, design system foundations, route stubs.
- **Phase 3** — Home: ask panel, question field, goal picker with inline competitors field, sources/time/depth popovers with inline key adding, fine-tune disclosure with change count, home notices, examples, recent list, sample link, start flow with draft autosave and from-prefill, controlled setting popovers with validation focus.
- **Phase 4** — Run loop extracted into `lib/client/runner.ts` (drop, retry, abort, resume, refund), `useRunner`, running view with step list/source rows/progress/live total, technical log, cancel dialog and in-app leave guard, error view with refund/retry/change-settings, research page state machine with resume, not-found and results frame.
- **Phase 5** — Report parsing and Prose with quotes/tables/new-tab links; insight, evidence and export helpers (CSV injection- and BOM-safe, with tests); results frame with rename, export menu, tab sync and banners; insights sections with on-this-page rail; theme rows with true-scale bars (tested); hand-built SVG trend chart with keyboard points; evidence tab with URL filters, paging, desktop table and mobile cards; how-was-this-made drawer with source table and SQL disclosure; print stylesheet, sheet-only variant, no-print hooks.
- **Phase 6** — Library with date groups, search, rename and remove-with-undo; settings with key fields, live usage, appearance, data and source status; sample report page on built-in illustrative data, read-only.
- **Phase 7** — Copy-deck pass for all remaining user-facing strings; motion trimmed to the allowlist (no skeleton pulse, no ask fade); dynamic imports for heavy results pieces (first load of `/` = 179 kB gz, under the 180 kB budget); responsive pass (mobile shell layout, results rail, 200%-zoom overflow); README rewritten for the redesigned app.
- **Phase 8** — Old UI deleted (`Studio.tsx`, `Markdown.tsx`, old `globals.css`; no unused npm dependencies existed); banned-pattern greps clean; all 20 journeys run headlessly; slop check; this report.

## Test results

- **Phase gates**: all green (typecheck, lint, 14 test files / 120 tests, build). Final Phase 8 gate log: `/tmp/gate8b.log`.
- **Build size**: `/` first load **179 kB gz** (budget 180 kB); `/sample` 180 kB, `/research/[id]` 185 kB (results-only pages, dynamic chunks).
- **Accessibility (axe-core 4.9.1)**: 0 violations of any impact on home, library, settings, sample-insights, sample-evidence in light and dark (CDN-injected into the production build — no new dependency installed, per the rules; Lighthouse itself was not run, see "Environment and method notes"). Re-checked on the live running page during the journeys: 0 serious/critical.
- **Two bugs found and fixed during journey verification** (both client-only, re-verified live after the fix):
  1. **Settings appearance toggle was inert.** `useTheme()` was called in `SettingsPage`, which renders `AppShell` — the `ThemeProvider` lives *inside* `AppShell`, so the page consumed the default context value (a no-op `setMode`) and the control could never switch the theme. The appearance section is now a child component that renders below the provider.
  2. **The "Your spreadsheet is ready" panel was unreachable.** The plan's "report is empty or only a stub" check had no server contract to match: the raw-data report is a non-empty DATA NOTE (`lib/report.ts`), so the stub test never matched and every spreadsheet-only run rendered the normal report view. The condition now keys on `result.rawCsv`, which the pipeline populates only for `format === "raw-data"` runs.
- **Responsive**: no horizontal overflow at 360/390/768/1024/1440 on every screen, light and dark (62 scripted captures); 200% zoom approximated at a 180 px viewport — fixed and re-verified (`scrollWidth == viewport`).
- **Journeys**: 20/20 journeys exercised headlessly. 17 pass outright; J8 is partially verified (its live trigger is environment-limited, see table); J7 is verified through the identical J4 cancel flow; J13 and J16 needed the two fixes listed above and were re-verified live after them.
- **Slop check**: clean, with two borderline observations noted below.

## Journeys (plan §9.1)

Run headlessly against the production build (`next` standalone output) in system Chrome via CDP:
trusted mouse/keyboard events, per-journey-group browser profiles (5 runs per 5 hours per profile,
fresh profile = fresh quota), real completed runs in basic mode (no working Gemini key in this
environment). Runs are visible per device, so every journey opened runs owned by its own profile.
Each check below was asserted in the DOM unless noted.

| Journey | Result | Notes |
|---|---|---|
| J1 First-time layman, defaults | PASS | 2 interactions (type, Start). Running view in 1.8 s (plan target 1 s; the remainder is the first server round-trip in this environment). Steps tick, results open with short version/themes/quotes, tab title updated, no jargon in UI text, axe 0 violations on the live running page. |
| J2 Basic mode (no AI key) | PASS | Notice shown once with "Add a key"/"Not now"; run completes in basic mode; results show "Basic mode: this summary was written by rules, not by AI."; "Not now" hides the notice permanently (reload-verified). |
| J3 Add a key | PASS (approx.) | Fake syntactically-valid key saved; settings shows "Saved (AIza…ake)" in place with "Paste a new key to replace it."; home basic-mode notice gone. Real-key validation is a human check. |
| J4 App reviews | PASS | App Store + Google Play auto-selected (visible in the sheet and in the request `platforms: [..., "appstore", "play"]`); App names field; 8 names warn "Up to 6"; request carries exactly 6 apps (`appsHint`, 8th dropped). Cancel: "Stop this research?" → "Stop research" → home with form filled, slot refunded (meter verified). |
| J5 Competitors | PASS | Competitors field shows once (inline), prefilled into fine-tune without duplication; comparison checkbox ticked; run completes. The "How competitors compare" section is absent from **basic-mode** reports (data-dependent, produced by the protected pipeline) — noted as a limitation, verified shape only on a key-validated run (human list). |
| J6 Refresh while running | PASS | Deep dive, refresh at step 3. The page returns to the running view at the right step (screenshot evidence; the DOM assertion raced the resume render, which took ~25–30 s in this loaded environment) and finishes; meter confirms no second slot (5 → 4). |
| J7 Cancel | PASS (via J4) | The J4 cancel exercised the same flow at step 1: cancel dialog, confirm, return to home with the form filled, slot refunded (meter 5 → 5 across the attempt). The "did not count" toast copy is in the deck (`cancelled`); the ~3 s toast was not caught by the scripted read. The standalone J7 attempt was invalidated by draft autosave (it typed on top of the restored draft question), not by the app. |
| J8 Network drop | PARTIAL | A 10 s offline at step 2 was survived without a drop: CDP's offline emulation hangs the active SSE stream instead of resetting it, so no `reconnect` event fired and the run stalled (environment edge, noted). A deterministic step-POST failure crashed headless Chrome after several re-POSTs. The drop → 1.5 s resume → finish and 4-drops → fatal+refund paths are unit-tested (`tests/runner.test.ts`); the live notice is on the human list. |
| J9 Fatal error | PASS | Mocked 500 on the first step POST (CDP Fetch). Error view: "We could not finish this research / Something went wrong on our side while reading the sources. / This attempt will not count against your limit." with "Try again" and "Change settings"; "Show details" reveals "Server error 500 — your slot was refunded."; meter proves the refund (3 → 3). A real 45 s offline attempt instead recovered and completed — correct by design (transient offline is retried, not fatal). |
| J10 Evidence | PASS (approx.) | Pool of 31 posts (the environment delivered 31, not the plan's 80+; paging still exercised via "Show 16 more"). Theme + Feeling filters, search and "Newest" sort combine; URL `?tab=evidence&q=…&theme=…&feeling=…&sort=newest` reproduces the view after reload, with highlighted terms. |
| J11 Library | PASS | ≥4 runs listed; search narrows the list ("abandon" → the 2 matching rows, a non-matching term → 0 rows + "No research matches that search."); rename persists and shows; removal hides the row; Undo (≈3 s toast) restores it; the renamed row persists after reload. (Early attempts read search as broken — a measurement artifact: the row counter counted every `/research/` link on the page, including the sidebar "Recent" list, which masked the library list. A main-scoped count proves the filter works.) |
| J12 Edit and run again | PASS | "Edit and run again" on a completed run returns to home prefilled with topic, sources and depth (Deep dive carried over); the notice names the source run; Start works and the edited run completes to results. (First attempt was invalid: it targeted a run owned by another profile, which correctly 404s as "created on another device".) |
| J13 Spreadsheet only | PASS | Fine-tune → Report style → Spreadsheet only; the request carries `format: "raw-data"`; single step "Preparing your spreadsheet"; results show the "Your spreadsheet is ready" panel with the theme list; Export menu lists "Download raw insights (.csv)" first. (Needed fix #2 above: the panel was unreachable in the original build. Re-verified with a fresh run after the fix.) Opening the CSV in a spreadsheet app is a human check. |
| J14 Phone (360×740) | PASS | No horizontal scroll (home, results, evidence); sources open as a bottom sheet; library row menu 44×44; evidence renders as cards (pool of 16) with theme filter, URL params and reload-reproduced view. |
| J15 Keyboard only | PASS | Textarea and Start reachable by Tab alone with visible focus rings; run starts via keyboard and completes; Where-to-look popover opens by keyboard, traps focus, returns focus to the trigger on close. |
| J16 Dark mode and system theme | PASS | Pre-paint inline script sets `data-theme` from `ie:theme` + `matchMedia` before first paint (verified in raw HTML). Dark applies after reload; highlighter yellow still reads as a highlight in dark (`rgba(242, 210, 75, 0.3)`). The settings toggle was inert in the original build (fix #1 above: the page consumed the default context value because it sits above the provider) — after the fix, Dark/Light/Match my device all switch the theme live (`dataset.theme` + `ie:theme` update without a reload). |
| J17 Reduced motion | PASS | Under `prefers-reduced-motion: reduce`: progress animation disabled, run completes, and the theme-bar fill is instant (`animation-duration: 1e-05s`, `animation-name: none`). |
| J18 Run limit reached | PASS | Driven for real: with 1 of 5 left the final run starts, the meter reads 0 while running, home Start is disabled with "You have used all 5 researches for now. The next one opens at 12:37 PM.", the meter element shows `aria-valuenow="0"` with 0 of 5 filled segments, and the final run still completes via the basic-mode fallback. |
| J19 Sample | PASS | `/sample` shows the "This is a sample report, so you can see what you will get." banner, looks like a real result (short version, themes, quotes, next steps — confirmed by a full headings dump: H1 + H2 "The short version" / "What people talk about most" / "What people love" / "What frustrates them" / "What they wish existed" / "In their own words" / "What is changing" / "What to do next"), with no Export and no re-run buttons. |
| J20 Not found | PASS | `/research/does-not-exist` shows "We cannot find that research" with the two buttons "Go to your research" and "Start new research" (verified at 1280 and 360). |

## Slop check (plan §9.3)

Screens reviewed at 1280 px and 360 px, light and dark: home, running, results (insights +
evidence), sample, library, settings, not-found, error, spreadsheet, sources sheet, limit state.

| # | Question | Answer |
|---|---|---|
| 1 | Gradient, glow, glass or neon anywhere? | No |
| 2 | Emoji used as an icon or decoration? | No (all icons are line SVGs; the kebab menu is an icon, not emoji) |
| 3 | Label ALL CAPS or tracked-out? | No (no `text-transform: uppercase` in the stylesheet; heading tracking is negative, not tracked-out) |
| 4 | Monospace outside the technical log and SQL? | No (technical log, SQL/source table in "How was this made?", semantic inline code only) |
| 5 | Button ends with an arrow? | No |
| 6 | Metadata a string of fragments joined by dots or dashes? | No — one borderline case: recent/library rows show "topic · N posts · N themes", a compact stat line rather than a tag list; kept by design |
| 7 | All cards share the same radius and shadow? | No — radii are tiered (`--r-sm`/`--r-md`/`--r-lg`) and only floating things (popovers, dialogs, menus, ask panel) carry shadows |
| 8 | Cards lift or glow on hover? | No (hover changes only text/underline colour and reveals the pencil affordance) |
| 9 | Sections fade or slide in on scroll? | No (motion is load-time bar fill + spinners, on the allowlist) |
| 10 | Single word in a heading coloured/bolded/italicised? | No |
| 11 | Numbered markers on things that are not a sequence? | No (numbers appear only in the short-version sequence and "What to do next") |
| 12 | Jargon from §5.1 visible outside Advanced / "For analysts"? | No in the UI (verified on results and all screens); report **content** produced by the protected pipeline still contains "Records analyzed", "Platforms", "Signal strength: THIN" inside the "For analysts" drawer — human list |
| 13 | Copy is a marketing claim? | No |
| 14 | More than one accent colour besides semantic ones? | No (single accent + semantic red/amber; the highlighter yellow is functional) |
| 15 | Highlighter yellow used for anything other than matched/active? | No (keyword matches in quotes, active filter chips) |
| 16 | Could look like any SaaS product with the logo swapped? | No — serif "voice" quotes, numbered short version, highlighter and paper tone make it distinct |
| 17 | Clear single focal point on each screen? | Yes (home: the question; running: the step list; results: the short version) |
| 18 | Could Arjun finish J1 with no instructions? | Yes (type, Start — 2 interactions) |

## Manual verification list (needs a human)

- **Real Gemini key run (J3 + quality)**: save a real key, run J1 end-to-end; confirm the key
  validates, the AI-quality summary, and that a competitors run shows the "How competitors
  compare" section (absent in basic mode, produced by the protected pipeline).
- **J8 live network drop**: put a real device on airplane mode for ~10 s at step 2 of a run and
  confirm "The connection dropped. Picking up where we left off." plus a clean finish. (CDP's
  offline emulation hangs the stream instead of dropping it, so this could not be triggered
  headlessly; the runner logic is unit-tested.)
- **J6 refresh latency on a normal connection**: in this loaded environment the running view
  reappeared ~25–30 s after refresh; confirm it is prompt on a normal connection.
- **J13 CSV**: open the exported "raw insights" CSV in a spreadsheet app and confirm the text and
  encoding are correct.
- **J18 window reset**: confirm the 5-per-5-hours window refills at the announced time and Start
  re-enables.
- **J10 80+ post pool**: the environment delivered 16–31 posts per run; confirm paging/filtering
  on a real large pool.
- **J16 no-flash on a real device** when switching themes (the pre-paint script is in the HTML;
  visual flash perception needs a human).
- **Screen reader (VoiceOver) pass**: axe is clean, but a human SR session on the five main
  screens was not run.
- **200% zoom on a real device** (approximated headlessly at a 180 px viewport).

## Environment and method notes

- **Basic mode only**: this environment has no working Gemini key, so every run completed via the
  heuristic (basic) path. AI-quality checks (Gemini-labeled summaries, key-validated runs) are on
  the human list.
- **axe-core instead of Lighthouse**: installing axe-core/playwright was ruled out before Phase 7
  by the no-new-dependencies rule; axe 4.9.1 was injected from a CDN and run with `axe.run()`.
  Lighthouse accessibility scores were therefore not produced.
- **Mobile emulation**: headless Chrome with `mobile: true` + `deviceScaleFactor: 2` produced
  broken split viewports in this build of Chrome, so captures used `mobile: false` with
  `deviceScaleFactor: 1`; width-based media queries behave identically.
- **Leave guard and refresh (J6)**: while a run is in flight the page registers a `beforeunload`
  guard (the plan's in-app leave guard); under CDP the refresh shows a JavaScript dialog that
  must be auto-accepted for the reload to proceed, which the harness did.
- **J9 (fatal error)**: the final trigger was a mocked 500 on `/api/agent/step` via CDP Fetch
  interception. A real 45 s offline attempt recovered and completed the run — correct behaviour,
  since transient offline is retried (`MAX_DROPS` = 3, 1.5 s resume) rather than fatal.
- **J8 limitation**: CDP `Network.emulateNetworkConditions` offline hangs an active SSE stream
  instead of resetting the TCP connection, so a genuine stream drop could not be forced; the
  reconnect path is covered by `tests/runner.test.ts` ("a dropped connection resumes after 1.5 s
  and finishes", "4 drops end in an error with refunded: true").
- **Runs are visible per device**: `/research/<token>` for a run created by another browser
  profile shows the not-found state ("It may have been removed, or it was created on another
  device"). Journeys therefore only ever opened runs owned by their own profile.
- **Quota**: 5 counted runs per 5 hours per browser profile; a fresh Chrome profile gets a fresh
  window. Failed and cancelled runs are refunded server-side (verified by meter reads in J4/J9).
- **Evidence pool size**: the environment delivered 16–31 posts per run, below the plan's 80+
  target for J10; paging and filters were still fully exercised.
- **Stale server state**: the local store still held Nov 7–9 key markers and a stale
  `.env.local` was loaded by the standalone build; both were removed for the journey run so J2
  exercised the genuine no-key path. (The repo's `.env.local` was left untouched.)
