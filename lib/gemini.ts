import fs from 'fs';
import path from 'path';
import { getKey } from './keys';
import { storeGetInt, storeIncr, storeSet, storeSetFlag } from './store';

const API = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const FALLBACK_CHAIN = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RetryableError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// ---------------- key pool (GEMINI_API_KEY, GEMINI_API_KEY_2, _3, …) ----------------

const KEY_NAME_RE = /^GEMINI_API_KEY(_\d+)?$/;

function keyNameOrder(): string[] {
  const names = Object.keys(process.env).filter((n) => KEY_NAME_RE.test(n) && (process.env[n] || '').trim());
  const rank = (n: string) => {
    const m = n.match(/_(\d+)$/);
    return m ? Number(m[1]) : 0;
  };
  return names.sort((a, b) => rank(a) - rank(b));
}

export function geminiKeys(): string[] {
  return keyNameOrder();
}

export function hasGeminiKey(): boolean {
  return geminiKeys().length > 0;
}

export function geminiConfig(): { key: string; model: string } {
  const names = geminiKeys();
  return {
    key: names.length ? getKey(names[0]) : '',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  };
}

// ---------------- shared daily usage ledger (user-agnostic global budget) ----------------
// ALL users of this deployment draw from ONE shared pool: keys * (quota/day).
// No "usage" API exists on the free tier, so every request we send is counted
// per key per UTC day in the shared KV store (files locally, Redis on Vercel
// via INSIGHT_EXTRACTOR_REDIS_URL). Quota errors from the API are the ground truth: they
// mark the key 100% utilized and refuse it until 00:00 UTC.

export function dailyQuota(): number {
  const q = Number(process.env.GEMINI_DAILY_QUOTA || '');
  return Number.isFinite(q) && q > 0 ? Math.floor(q) : 20;
}

const PT_TZ = 'America/Los_Angeles';

/**
 * The Gemini free tier resets at Pacific Time MIDDLE of the night — PT
 * midnight, not UTC. All quota accounting below is scoped to the PACIFIC
 * day so our ledger and Google's counter roll over on the same boundary
 * (the ZDF fold below also survives PST/PDT transitions).
 */
function ptDayStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: PT_TZ }); // YYYY-MM-DD in PT
}

function dayStamp(): string {
  return ptDayStr(new Date());
}

function nextPtMidnight(): number {
  const now = new Date();
  const [y, m, d] = ptDayStr(now).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); // tomorrow, as a plain YYYY-MM-DD
  // Pacific offsets are 7h (PDT) or 8h (PST), so the PT-midnight of `target`
  // lies within [targetUTCDate + 6h, targetUTCDate + 9h]. Binary search the
  // first instant whose PT date is `target` — correct through DST transitions.
  let lo = Date.UTC(y, m - 1, d + 1) + 6 * 3600_000;
  let hi = Date.UTC(y, m - 1, d + 1) + 9 * 3600_000;
  if (ptDayStr(new Date(hi)) < target) hi += 3600_000; // paranoia
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (ptDayStr(new Date(mid)) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

function ttlToDayEnd(): number {
  return Math.max(60, Math.ceil((nextPtMidnight() - Date.now()) / 1000));
}

function usageKey(name: string) { return `insight-extractor:usage:${dayStamp()}:${name}`; }
function exhaustKey(name: string) { return `insight-extractor:exhausted:${dayStamp()}:${name}`; }
function unwellKey(name: string) { return `insight-extractor:unwell:${dayStamp()}:${name}`; }
/** Transient-failure cooldown: a key that errored (non-quota) is skipped by
 * every user's next runs for this long, then automatically retried. */
const UNWELL_COOLDOWN_MS = 30 * 60 * 1000;

async function bumpUsage(name: string) {
  await storeIncr(usageKey(name), 1, ttlToDayEnd());
}

/**
 * A quota failure means this key has fully spent its daily allocation:
 * record it as QUOTA/QUOTA (e.g. 20/20) and refuse it for the rest of the UTC day.
 */
async function markExhausted(name: string) {
  const quota = dailyQuota();
  const used = await storeGetInt(usageKey(name));
  if (used < quota) await storeIncr(usageKey(name), quota - used, ttlToDayEnd());
  await storeSetFlag(exhaustKey(name), ttlToDayEnd());
}

async function markUnwell(name: string) {
  const until = Date.now() + UNWELL_COOLDOWN_MS;
  await storeSet(unwellKey(name), until, Math.ceil(UNWELL_COOLDOWN_MS / 1000));
}

async function keyRemaining(name: string): Promise<number> {
  const quota = dailyQuota();
  if ((await storeGetInt(exhaustKey(name))) > 0) return 0; // quota: refused until Pacific midnight
  const unwellUntil = await storeGetInt(unwellKey(name));
  if (unwellUntil > Date.now()) return 0; // transient failure: cooldown, any user skips it
  return Math.max(0, quota - (await storeGetInt(usageKey(name))));
}

export interface KeyUsageView { name: string; used: number; quota: number; exhausted: boolean; remaining: number; cooldownUntil: number | null }
export interface GeminiUsageView { day: string; keys: KeyUsageView[]; totalUsed: number; totalQuota: number }

export async function geminiUsage(): Promise<GeminiUsageView> {
  const quota = dailyQuota();
  const names = geminiKeys();
  const keys = await Promise.all(names.map(async (n) => {
    const used = await storeGetInt(usageKey(n));
    const exhausted = (await storeGetInt(exhaustKey(n))) > 0;
    const unwellUntil = await storeGetInt(unwellKey(n));
    const cooldownUntil = !exhausted && unwellUntil > Date.now() ? unwellUntil : null;
    const skipped = exhausted || cooldownUntil !== null;
    return { name: n, used, quota, exhausted, remaining: skipped ? 0 : Math.max(0, quota - used), cooldownUntil };
  }));
  return {
    day: dayStamp(),
    keys,
    totalUsed: keys.reduce((s, k) => s + Math.min(k.used, k.quota), 0),
    totalQuota: names.length * quota,
  };
}

// ---------------- dispatch: one key at a time, instant failover ----------------

function modelChain(): string[] {
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  return [...new Set([model, ...FALLBACK_CHAIN].filter(Boolean))];
}

// Model-level cooldown: a model that errors (timeout/5xx) is skipped by
// every run for a while, so a stuck model can't burn 40s of every request.
// Stored in the shared KV store — global across all instances.
const MODEL_COOLDOWN_MS = 10 * 60 * 1000;
function modelUnwellKey(model: string) {
  return `insight-extractor:modelunwell:${model}`;
}
async function modelInCooldown(model: string): Promise<boolean> {
  const until = await storeGetInt(modelUnwellKey(model));
  return until > Date.now();
}
async function markModelUnwell(model: string): Promise<void> {
  const until = Date.now() + MODEL_COOLDOWN_MS;
  await storeSet(modelUnwellKey(model), String(until), Math.ceil(MODEL_COOLDOWN_MS / 1000));
}

function isQuotaError(e: unknown): boolean {
  const err = e as { status?: number; message?: string };
  if (err.status === 429) return true;
  const m = err.message ?? '';
  return /quota|rate.?limit|resource.?exhaust|exhausted/i.test(m);
}

async function callModelOnce(
  model: string, keyName: string, system: string, user: string,
  maxTokens: number, temperature: number, effort: 'low' | 'medium', jsonMode: boolean
): Promise<string> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey(keyName)}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature,
      max_tokens: maxTokens,
      reasoning_effort: effort,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
    // Keep per-attempt time tight: on Vercel long-lived serverless requests
    // get killed (~60-90s), so a stalled model must fail over fast instead
    // of holding the whole run hostage for three minutes.
    signal: AbortSignal.timeout(40_000),
  });
  if (res.status === 404) throw new Error('model_missing');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new RetryableError(res.status, `Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  const choice = data?.choices?.[0];
  const text = choice?.message?.content ?? '';
  if (choice?.finish_reason === 'length') throw new RetryableError(500, 'response truncated (token budget)');
  if (!text) throw new Error('Gemini returned empty content');
  return text;
}

export interface GeminiAttempt {
  model: string;
  key: string;
  outcome: 'ok' | 'quota' | 'error' | 'model-missing';
  detail?: string;
}
export type AttemptLog = (a: GeminiAttempt) => void;

interface DispatchOpts {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  effort: 'low' | 'medium';
  jsonMode: boolean;
}

/**
 * One logical call, budget-protected:
 *  - keys are tried ONE AT A TIME, sticky primary-first (no parallel key hits,
 *    no load balancing, no status probes) — the primary key keeps serving
 *    every call as long as it works;
 *  - for a key, models are walked 3.8-flash → 3.6 → 3.5 → 3.1-lite;
 *  - a 503 "high demand" on a model moves to the NEXT MODEL ON THE SAME KEY
 *    (model issues must not burn other keys' quota);
 *  - a quota error (429 / "quota exceeded") EXHAUSTS that key for the day
 *    and instantly moves to the next key;
 *  - at most one attempt per (key, model) pair — fast failover, no hammering;
 *  - every request that reaches Gemini is counted in the daily usage ledger
 *    so the UI shows remaining calls without any extra status request.
 */
async function dispatch(o: DispatchOpts, onAttempt?: AttemptLog): Promise<string> {
  let models = modelChain();
  const live = (await Promise.all(models.map(async (m) => ({ m, ok: !(await modelInCooldown(m)) })))).filter((x) => x.ok).map((x) => x.m);
  if (live.length) models = live; // all in cooldown → still try (last resort)
  const errs: string[] = [];
  // STICKY KEY ORDER, error-driven failover — no probing, no balancing:
  // GEMINI_API_KEY is primary and stays primary for the whole day.
  // GEMINI_API_KEY_2 is only reached when the primary ERRORS (quota failure
  // marks it 20/20 and refuses it for the rest of the UTC day, so the ledger
  // itself tells us which key to start with — no status check is ever sent).
  const infos = await Promise.all(geminiKeys().map(async (n) => ({ n, rem: await keyRemaining(n) })));
  const keys = infos.filter((x) => x.rem > 0);
  if (!keys.length) {
    throw new Error('Gemini daily quota exhausted on all keys — the shared budget resets at Pacific midnight');
  }
  const deadModels = new Set<string>();
  for (const { n } of keys) {
    let quotaHit = false;
    for (const model of models) {
      if (deadModels.has(model)) continue;
      try {
        const text = await callModelOnce(model, n, o.system, o.user, o.maxTokens, o.temperature, o.effort, o.jsonMode);
        await bumpUsage(n);
        return text;
      } catch (err) {
        const e = err as Error;
        errs.push(`[${model}/${n}] ${e.message.slice(0, 140)}`);
        if (e.message === 'model_missing') {
          deadModels.add(model); // model is gone everywhere — next model, same key
          continue;
        }
        if (isQuotaError(e)) {
          await markExhausted(n); // record QUOTA/QUOTA + refuse until 00:00 UTC
          quotaHit = true;
          break; // instantly on to the next key
        }
        if (e.message !== 'model_missing') await markModelUnwell(model);
        await bumpUsage(n); // transient error: the request was sent — it counts
        await sleep(900);
        continue; // model hiccup → try the next model on the SAME key
      }
    }
    if (quotaHit) continue;
    // This key failed all of its model attempts (transient errors).
    // REMEMBER IT: every subsequent run — same user or any other user, same
    // day — automatically starts with the next key for 30 minutes, then the
    // key is quietly retried as primary again.
    await markUnwell(n);
  }
  throw new Error(`Gemini unavailable after failover: ${errs.slice(-2).join(' | ')}`);
}

export async function geminiText(system: string, user: string, maxTokens = 4096, temperature = 0.4, onAttempt?: AttemptLog): Promise<string> {
  return dispatch({ system, user, maxTokens, temperature, effort: 'low', jsonMode: false }, onAttempt);
}

function closeTruncated(t: string): string {
  const stack: string[] = [];
  let inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  let fixed = inStr ? t + '"' : t;
  fixed = fixed.replace(/,\s*$/, '');
  while (stack.length) fixed += stack.pop()!;
  return fixed;
}

export function extractJson(text: string): any {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.search(/[\[{]/);
  if (start === -1) throw new Error('No JSON found in LLM output');
  t = t.slice(start);
  const lastBrace = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (lastBrace !== -1) t = t.slice(0, lastBrace + 1);
  const attempts = [
    t,
    t.replace(/,\s*([}\]])/g, '$1'),
    closeTruncated(t),
    closeTruncated(t).replace(/,\s*$/, ''),
  ];
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      /* try next */
    }
  }
  throw new Error('Could not parse JSON from LLM output');
}

export async function geminiJson(system: string, user: string, maxTokens = 16384, temperature = 0.2, onAttempt?: AttemptLog): Promise<any> {
  const out = await dispatch({ system, user, maxTokens, temperature, effort: 'low', jsonMode: true }, onAttempt);
  return extractJson(out);
}
