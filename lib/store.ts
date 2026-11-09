import fs from 'fs';
import net from 'net';
import path from 'path';
import tls from 'tls';

/**
 * Minimal KV store for SHARED platform state (the global Gemini call budget,
 * the per-user run windows).
 *
 * - Default (localhost / single instance): JSON files under `.insight-extractor/`
 *   (a legacy `.askcard/` directory is migrated automatically on first use).
 * - Set INSIGHT_EXTRACTOR_REDIS_URL (e.g. a free Upstash `rediss://` URL; the
 *   legacy ASKCARD_REDIS_URL name is still honored) and the same
 *   state becomes GLOBAL across every Vercel instance/region — the shared
 *   Gemini budget is then enforced platform-wide, not per instance.
 *
 * If the Redis backend is unreachable we fail OPEN to the local files so the
 * platform never hard-fails on state-store issues (Google's own quota errors
 * remain the ground truth and re-mark keys exhausted).
 */

const LEGACY_DIR = path.join(process.cwd(), '.askcard');

/**
 * Pick a data dir that actually works:
 * - Vercel/serverless: process.cwd() is read-only, so prefer /tmp (ephemeral,
 *   but the app tolerates state loss; shared budgets should use Redis there).
 * - localhost: the project directory, so state survives restarts.
 */
function resolveDataDir(): string {
  const candidates = process.env.VERCEL
    ? [path.join('/tmp', '.insight-extractor'), path.join(process.cwd(), '.insight-extractor')]
    : [path.join(process.cwd(), '.insight-extractor'), path.join('/tmp', '.insight-extractor')];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      /* try next candidate */
    }
  }
  return candidates[0];
}

export const FILE_DIR = resolveDataDir();

/**
 * Ensures the data dir exists, migrating the legacy `.askcard/` directory
 * (renamed to `.insight-extractor/`) on first use so local state survives.
 * Never throws — a read-only filesystem must not take API routes down.
 */
export function ensureDataDir(): string {
  try {
    if (!fs.existsSync(FILE_DIR) && fs.existsSync(LEGACY_DIR)) fs.renameSync(LEGACY_DIR, FILE_DIR);
  } catch {
    /* best effort */
  }
  try {
    fs.mkdirSync(FILE_DIR, { recursive: true });
  } catch {
    /* read-only filesystem: run stateless */
  }
  return FILE_DIR;
}

interface RedisCfg { host: string; port: number; auth?: string; useTls: boolean }

function parseRedisUrl(): RedisCfg | null {
  const raw = (process.env.INSIGHT_EXTRACTOR_REDIS_URL || process.env.ASKCARD_REDIS_URL || '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'redis:' && u.protocol !== 'rediss:') return null;
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 6379,
      auth: u.password ? decodeURIComponent(u.password) : undefined,
      useTls: u.protocol === 'rediss:',
    };
  } catch {
    return null;
  }
}

// ---------------- file backend ----------------

interface FilePayload { v: unknown; exp?: number }

function fileRead(key: string): FilePayload | null {
  try {
    ensureDataDir();
    const p = path.join(FILE_DIR, `${key}.json`);
    if (!fs.existsSync(p)) return null;
    const d = JSON.parse(fs.readFileSync(p, 'utf8')) as FilePayload;
    if (d && typeof d.exp === 'number' && d.exp < Date.now()) return null;
    return d;
  } catch {
    return null;
  }
}

function fileWrite(key: string, v: unknown, ttlSeconds?: number) {
  try {
    fs.mkdirSync(FILE_DIR, { recursive: true });
    const d: FilePayload = ttlSeconds ? { v, exp: Date.now() + ttlSeconds * 1000 } : { v };
    fs.writeFileSync(path.join(FILE_DIR, `${key}.json`), JSON.stringify(d));
  } catch {
    /* ephemeral filesystem — in-memory only */
  }
}

// ---------------- minimal RESP client (no dependencies) ----------------

function respEncode(args: string[]): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) {
    const b = Buffer.from(a);
    parts.push(Buffer.from(`$${b.length}\r\n`), b, Buffer.from('\r\n'));
  }
  return Buffer.concat(parts);
}

function parseReply(buf: Buffer): { value: unknown; rest: Buffer; complete: boolean } {
  const lineEnd = buf.indexOf('\r\n');
  if (lineEnd === -1) return { value: undefined, rest: buf, complete: false };
  const head = String.fromCharCode(buf[0]);
  const line = buf.subarray(1, lineEnd).toString();
  if (head === '+') return { value: line, rest: buf.subarray(lineEnd + 2), complete: true };
  if (head === '-') {
    const err = new Error(line);
    return { value: err, rest: buf.subarray(lineEnd + 2), complete: true };
  }
  if (head === ':') return { value: Number(line), rest: buf.subarray(lineEnd + 2), complete: true };
  if (head === '$') {
    const n = Number(line);
    if (n === -1) return { value: null, rest: buf.subarray(lineEnd + 2), complete: true };
    const start = lineEnd + 2;
    if (buf.length < start + n + 2) return { value: undefined, rest: buf, complete: false };
    return { value: buf.subarray(start, start + n).toString(), rest: buf.subarray(start + n + 2), complete: true };
  }
  if (head === '*') {
    const n = Number(line);
    if (n === -1) return { value: null, rest: buf.subarray(lineEnd + 2), complete: true };
    let rest = buf.subarray(lineEnd + 2);
    const arr: unknown[] = [];
    for (let i = 0; i < n; i++) {
      const r = parseReply(rest);
      if (!r.complete) return { value: undefined, rest: buf, complete: false };
      arr.push(r.value);
      rest = r.rest;
    }
    return { value: arr, rest, complete: true };
  }
  return { value: null, rest: buf.subarray(lineEnd + 2), complete: true };
}

async function redisCommand(args: string[], timeoutMs = 5000): Promise<unknown> {
  const cfg = parseRedisUrl();
  if (!cfg) throw new Error('INSIGHT_EXTRACTOR_REDIS_URL not set (legacy ASKCARD_REDIS_URL also honored)');
  return new Promise((resolve, reject) => {
    const socket: net.Socket = cfg.useTls
      ? (tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) as net.Socket)
      : (net.connect({ host: cfg.host, port: cfg.port }) as net.Socket);
    const expected = cfg.auth ? 2 : 1;
    const replies: unknown[] = [];
    let buf: Buffer = Buffer.alloc(0);
    let done = false;
    const timer = setTimeout(() => fail(new Error(`redis timeout after ${timeoutMs}ms`)), timeoutMs);
    const fail = (e: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch { /* noop */ }
      reject(e);
    };
    socket.on('error', fail);
    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (replies.length < expected) {
        const r = parseReply(buf);
        if (!r.complete) break;
        replies.push(r.value);
        buf = r.rest;
      }
      if (replies.length >= expected && !done) {
        done = true;
        clearTimeout(timer);
        if (replies[0] instanceof Error) { socket.end(); reject(replies[0]); return; }
        const out = replies[expected - 1];
        socket.end();
        if (out instanceof Error) reject(out);
        else resolve(out);
      }
    });
    socket.on('connect', () => {
      const cmds: string[][] = [];
      if (cfg.auth) cmds.push(['AUTH', cfg.auth]);
      cmds.push(args);
      for (const c of cmds) {
        if (!socket.write(respEncode(c))) break;
      }
    });
  });
}

function warnFallback(e: unknown) {
  console.warn(`[insight-extractor] shared store unreachable, using local ledger: ${(e as Error).message}`);
}

// ---------------- store API ----------------

/** Plain integer counter (atomic on Redis via INCRBY). */
export async function storeGetInt(key: string): Promise<number> {
  if (parseRedisUrl()) {
    try {
      const v = await redisCommand(['GET', key]);
      return typeof v === 'string' ? Number(v) || 0 : 0;
    } catch (e) { warnFallback(e); }
  }
  const d = fileRead(key);
  return d ? Number(d.v) || 0 : 0;
}

export async function storeIncr(key: string, amount: number, ttlSeconds?: number): Promise<number> {
  if (parseRedisUrl()) {
    try {
      const v = await redisCommand(ttlSeconds ? ['INCRBY', key, String(amount), 'EX', String(ttlSeconds)] : ['INCRBY', key, String(amount)]);
      return typeof v === 'number' ? v : 0;
    } catch (e) { warnFallback(e); }
  }
  const d = fileRead(key);
  const next = (d ? Number(d.v) || 0 : 0) + amount;
  fileWrite(key, next, ttlSeconds);
  return next;
}

export async function storeSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const payload = String(value);
  if (parseRedisUrl()) {
    try {
      await redisCommand(ttlSeconds ? ['SET', key, payload, 'EX', String(ttlSeconds)] : ['SET', key, payload]);
      return;
    } catch (e) { warnFallback(e); }
  }
  fileWrite(key, value, ttlSeconds);
}

export async function storeSetFlag(key: string, ttlSeconds?: number): Promise<void> {
  if (parseRedisUrl()) {
    try {
      await redisCommand(ttlSeconds ? ['SET', key, '1', 'EX', String(ttlSeconds)] : ['SET', key, '1']);
      return;
    } catch (e) { warnFallback(e); }
  }
  fileWrite(key, 1, ttlSeconds);
}

export interface WindowState { start: number; count: number }

export async function storeGetWindow(key: string, windowMs: number): Promise<WindowState | null> {
  const ttl = Math.ceil(windowMs / 1000);
  if (parseRedisUrl()) {
    try {
      const v = await redisCommand(['GET', key]);
      if (typeof v !== 'string' || !v) return null;
      const d = JSON.parse(v) as WindowState;
      if (!d || typeof d.start !== 'number' || now() - d.start >= windowMs) return null;
      return d;
    } catch (e) { warnFallback(e); }
  }
  const d = fileRead(key);
  const w = d?.v as WindowState | undefined;
  if (!w || typeof w.start !== 'number' || now() - w.start >= windowMs) return null;
  return w;
}

export async function storeSetWindow(key: string, state: WindowState, windowMs: number): Promise<void> {
  const ttl = Math.ceil(windowMs / 1000);
  if (parseRedisUrl()) {
    try {
      await redisCommand(['SET', key, JSON.stringify(state), 'EX', String(ttl)]);
      return;
    } catch (e) { warnFallback(e); }
  }
  fileWrite(key, state, ttl);
}

function now() { return Date.now(); }
