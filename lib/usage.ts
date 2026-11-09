import crypto from 'crypto';
import { storeGetWindow, storeSetWindow } from './store';

export function runWindowConfig(): { limit: number; windowMs: number } {
  const limit = Number(process.env.RUNS_PER_WINDOW || '');
  const hours = Number(process.env.RUN_WINDOW_HOURS || '');
  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5,
    windowMs: (Number.isFinite(hours) && hours > 0 ? hours : 5) * 3600_000,
  };
}

function hashUid(uid: string): string {
  return crypto.createHash('sha256').update(uid || 'local').digest('hex').slice(0, 16);
}

function windowKey(uid: string): string {
  return `insight-extractor:window:${hashUid(uid)}`;
}

/**
 * Per-user rolling window (ChatGPT-style): at most `limit` agent runs per
 * `windowMs`, scoped to the caller's stable user id (falls back to IP on
 * Vercel where the client id may be absent). The window state lives in the
 * shared KV store so it is enforced across all instances.
 */
export async function runWindowFor(uid: string): Promise<{ ok: boolean; used: number; limit: number; resetsAt: number }> {
  const { limit, windowMs } = runWindowConfig();
  const w = await storeGetWindow(windowKey(uid), windowMs);
  const now = Date.now();
  if (!w) return { ok: true, used: 0, limit, resetsAt: now + windowMs };
  return { ok: w.count < limit, used: w.count, limit, resetsAt: w.start + windowMs };
}

export async function consumeRun(uid: string): Promise<void> {
  const { windowMs } = runWindowConfig();
  const key = windowKey(uid);
  const now = Date.now();
  const w = await storeGetWindow(key, windowMs);
  if (!w || now - w.start >= windowMs) await storeSetWindow(key, { start: now, count: 1 }, windowMs);
  else await storeSetWindow(key, { start: w.start, count: w.count + 1 }, windowMs);
}

export function clientUid(req: { headers: { get(name: string): string | null } }): string {
  const uid = (req.headers.get('x-insight-extractor-user') || '').trim();
  if (/^[A-Za-z0-9_-]{8,64}$/.test(uid)) return uid;
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return `ip:${xf.split(',')[0].trim()}`;
  const xri = req.headers.get('x-real-ip');
  return xri ? `ip:${xri.split(',')[0].trim()}` : 'local';
}
