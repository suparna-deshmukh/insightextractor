import { NextRequest } from 'next/server';
import { runStep, STAGES } from '@/lib/pipeline';
import { loadState, saveState, newState, assembleResult, DONE_STAGE } from '@/lib/runState';
import { RunRequest, SourceId, Objective, ReportFormat, PipelineMode, TimeFrame } from '@/lib/types';
import { runWindowFor, consumeRun, clientUid, refundRun } from '@/lib/usage';
import { saveRun } from '@/lib/runs';
import { hydrateStoredKeys } from '@/lib/keys';
import { storeSetFlag, storeDel } from '@/lib/store';
import { GeminiStepPendingError, hasGeminiKey, geminiConfig } from '@/lib/gemini';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * STEP-DRIVEN agent runs.
 *
 * One request = one pipeline stage (plan → fetch → clean → label → analyze →
 * report). Progress is checkpointed in the shared KV store (Redis on Vercel)
 * under the client's run token. Vercel may kill any single request at any
 * moment — when that happens the client simply POSTs the same token again and
 * the run continues from the last checkpoint, so a kill costs at most one
 * stage instead of the whole run (the old long-lived stream died mid-Gemini
 * call and lost everything).
 *
 * Event protocol (SSE, same as /api/agent/stream):
 *   stage | log | source | sql | result  — pipeline output
 *   step_done {stage}      — stage checkpointed; client may send the next POST
 *   step_retry  {reason}   — this stage will be retried by the next POST
 *   error {message}        — terminal failure (slot refunded server-side)
 */

const VALID_SOURCES: SourceId[] = ['hn', 'reddit', 'appstore', 'play', 'github', 'google', 'producthunt', 'youtube'];
const VALID_OBJECTIVES: Objective[] = ['problem-discovery', 'product-validation', 'post-launch', 'competitor-teardown', 'feature-prioritization'];
const VALID_FORMATS: ReportFormat[] = ['one-pager', 'full-report', 'data-first', 'exec-brief', 'raw-data'];
const VALID_MODES: PipelineMode[] = ['rapid', 'deep'];
const VALID_LENGTHS = ['concise', 'standard', 'detailed'] as const;
const VALID_TONES = ['formal', 'conversational', 'neutral'] as const;
const TF_PRESETS = ['7d', '30d', '90d', '1y', 'all', 'custom'] as const;
const RUN_TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

function validTf(x: any): TimeFrame | null {
  if (!x || typeof x !== 'object') return null;
  if (!TF_PRESETS.includes(x.preset)) return null;
  if (x.preset === 'custom') {
    if (!x.start || !x.end || x.start > x.end) return null;
    if (x.start > new Date().toISOString().slice(0, 10)) return null;
    if ((new Date(x.end).getTime() - new Date(x.start).getTime()) / 86400_000 > 1500) return null;
    return { preset: 'custom', start: x.start, end: x.end };
  }
  return { preset: x.preset };
}

function runWindowConfigTtl(): number {
  const hours = Number(process.env.RUN_WINDOW_HOURS || '');
  return (Number.isFinite(hours) && hours > 0 ? hours : 5) * 3600;
}

// Validation is intentionally identical to /api/agent/stream.
function validate(body: any): { req?: RunRequest; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' };
  const topic = String(body.topic ?? '').trim();
  const description = String(body.description ?? '').trim();
  if (topic.length < 3) return { error: 'Topic is required (min 3 chars)' };
  if (description.length < 30) return { error: 'Please describe the topic in at least 30 characters — the agent plans from this.' };
  const objective: Objective = VALID_OBJECTIVES.includes(body.objective) ? body.objective : 'problem-discovery';
  const competitors = ((Array.isArray(body.competitors) ? body.competitors : []) as unknown[]).map(String).map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const appsHint = ((Array.isArray(body.appsHint) ? body.appsHint : []) as unknown[]).map(String).map((x) => x.trim()).filter(Boolean).slice(0, 6);
  const brandHint = String(body.brandHint ?? '').trim().slice(0, 120);
  const industry = String(body.industry ?? '').trim().slice(0, 80);
  const audience = String(body.audience ?? '').trim().slice(0, 80);
  const keywords = ((Array.isArray(body.keywords) ? body.keywords : []) as unknown[]).map(String).map((x) => x.trim()).filter(Boolean).slice(0, 10);
  const focusAreas = ((Array.isArray(body.focusAreas) ? body.focusAreas : []) as unknown[]).map(String).filter(Boolean).slice(0, 8);
  const compareCompetitors = Boolean(body.compareCompetitors);
  const reportLength = (VALID_LENGTHS as readonly string[]).includes(body.reportLength) ? body.reportLength : 'standard';
  const tone = (VALID_TONES as readonly string[]).includes(body.tone) ? body.tone : 'neutral';

  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter((p: any) => VALID_SOURCES.includes(p));
  if (!platforms.length) return { error: 'Select at least one platform to tap into.' };

  const tfs = body.timeframes ?? {};
  const defTf = validTf(tfs.default) ?? validTf(body.timeframe) ?? { preset: '30d' as const };
  const overrides: Partial<Record<SourceId, TimeFrame>> = {};
  if (tfs.overrides && typeof tfs.overrides === 'object') {
    for (const [k, v] of Object.entries(tfs.overrides)) {
      if (!VALID_SOURCES.includes(k as SourceId)) continue;
      const tf = validTf(v);
      if (tf) overrides[k as SourceId] = tf;
    }
  }

  const format: ReportFormat = VALID_FORMATS.includes(body.format) ? body.format : 'one-pager';
  const mode: PipelineMode = VALID_MODES.includes(body.mode) ? body.mode : 'rapid';
  return { req: { topic, description, objective, competitors, industry, audience, keywords, focusAreas, compareCompetitors, reportLength: reportLength as any, tone: tone as any, appsHint, brandHint, platforms, timeframes: { default: defTf, overrides }, format, mode } };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const runToken = (typeof body?.runToken === 'string' && RUN_TOKEN_RE.test(body.runToken)) ? body.runToken : null;
  const encoder = new TextEncoder();
  const uid = clientUid(req);
  // Cold instances may lack keys saved via the settings UI — pull them from
  // the shared store before the pipeline reads them.
  await hydrateStoredKeys();
  const slotKey = runToken ? `insight-extractor:runslot:${runToken}` : null;

  const stream = new ReadableStream({
    async start(controller) {
      let lastEventAt = Date.now();
      const send = (e: unknown) => {
        lastEventAt = Date.now();
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* closed */
        }
      };
      // A stage can sit on one long Gemini attempt; keep the console honest
      // with a "still working" log whenever the stream is silent 20s+.
      const stallTimer = setInterval(() => {
        const idleMs = Date.now() - lastEventAt;
        if (idleMs >= 20_000) {
          lastEventAt = Date.now();
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'log', text: `⏳ Still working — waiting on Gemini/platform APIs (${Math.round(idleMs / 1000)}s since last step)…`, tone: 'info' })}\n\n`));
          } catch {
            /* closed */
          }
        }
      }, 5_000);
      try {
        if (!runToken) {
          send({ type: 'error', message: 'Missing run token' });
          return;
        }

        let state = await loadState(runToken);
        if (!state) {
          if (typeof body?.topic === 'string') {
            // First POST for this run: validate, take a slot, open the state.
            const { req: run, error } = validate(body);
            if (error) {
              send({ type: 'error', message: error });
              return;
            }
            const rl = await runWindowFor(uid);
            if (!rl.ok) {
              const reset = new Date(rl.resetsAt).toLocaleTimeString('en-GB', { hour12: false });
              send({ type: 'error', message: `Run limit reached: ${rl.limit} agent runs per rolling window. Your next slot opens at ${reset}.` });
              return;
            }
            await consumeRun(uid);
            if (slotKey) await storeSetFlag(slotKey, runWindowConfigTtl());
            const usedLlm = hasGeminiKey();
            state = newState(runToken, run!, usedLlm ? geminiConfig().model : 'heuristic-fallback', usedLlm);
            await saveState(state);
            send({ type: 'stage', stage: STAGES[0], index: 0, total: STAGES.length });
            send({ type: 'log', text: 'Pipeline started — agent booting.', tone: 'info' });
          } else {
            send({ type: 'error', message: 'Run state not found or expired — start a new run.' });
            return;
          }
        }

        if (state.stage >= DONE_STAGE) {
          // The run already finished server-side — the result event was most
          // likely lost in transit. Re-deliver it from the checkpoint.
          const result = assembleResult(state);
          if (!state.saved) {
            await saveRun(uid, state.request, result);
            state.saved = true;
            await saveState(state);
          }
          if (slotKey) await storeDel(slotKey);
          send({ type: 'result', result });
          return;
        }

        const stepT0 = Date.now();
        try {
          const result = await runStep(state, send, { oneShot: true });
          await saveState(state);
          if (result) {
            await saveRun(uid, state.request, result);
            state.saved = true;
            await saveState(state);
            if (slotKey) await storeDel(slotKey);
            send({ type: 'result', result });
            console.log(`[step] run done t+${process.uptime().toFixed(1)}s uid=${uid} wall=${Date.now() - stepT0}ms kept=${result.keptRecords}`);
          } else {
            console.log(`[step] step done t+${process.uptime().toFixed(1)}s uid=${uid} next=${state.stage} wall=${Date.now() - stepT0}ms`);
            send({ type: 'step_done', stage: state.stage });
          }
        } catch (err) {
          if (err instanceof GeminiStepPendingError) {
            // Stage left at its checkpoint; the client's next POST re-runs it
            // with the failed model/key now in cooldown. No refund — the run
            // continues.
            console.log(`[step] stage pending t+${process.uptime().toFixed(1)}s uid=${uid} stage=${state.stage}: ${(err as Error).message}`);
            send({ type: 'step_retry', reason: (err as Error).message });
            return;
          }
          console.error(`[step] run error t+${process.uptime().toFixed(1)}s uid=${uid} stage=${state.stage}: ${(err as Error).message}`);
          // Failed runs don't burn the budget.
          await refundRun(uid).catch(() => {});
          if (slotKey) await storeDel(slotKey).catch(() => {});
          send({ type: 'error', message: (err as Error).message ?? String(err) });
        }
      } catch (err) {
        console.error(`[step] route error uid=${uid}: ${(err as Error).message}`);
        try {
          send({ type: 'error', message: 'Internal error — your slot was refunded, press Retry to re-run.' });
        } catch {
          /* closed */
        }
      } finally {
        clearInterval(stallTimer);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
