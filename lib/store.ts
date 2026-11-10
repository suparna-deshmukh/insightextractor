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

// ---------------- pooled connection (one socket per process) ----------------
// A fresh TLS handshake from a Vercel instance can cost seconds, so commands
// share ONE persistent socket: all commands are serialized through a queue,
// replies parse in the same order, and a timeout/socket error drops the
// connection (the next command reconnects).

interface QueuedCmd {
  args: string[] | null; // null = AUTH handshake (reply discarded)
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  t0: number;
  sent?: boolean;
}

let conn: { socket: net.Socket; buf: Buffer; authed: boolean } | null = null;
let queue: QueuedCmd[] = [];

function killConn(e: Error) {
  if (conn) {
    try { conn.socket.destroy(); } catch { /* noop */ }
    conn = null;
  }
  const pending = queue;
  queue = [];
  for (const q of pending) {
    clearTimeout(q.timer);
    q.reject(e);
  }
}

function pump(): void {
  if (!conn) return;
  const { socket } = conn;
  for (const q of queue) {
    if (!q.args || q.sent) continue; // AUTH is written at connect time
    q.sent = true;
    if (!socket.write(respEncode(q.args))) break; // backpressure; 'drain' resumes
  }
}

function connectAndPump(cfg: RedisCfg): void {
  const socket: net.Socket = cfg.useTls
    ? (tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) as net.Socket)
    : (net.connect({ host: cfg.host, port: cfg.port }) as net.Socket);
  conn = { socket, buf: Buffer.alloc(0), authed: false };
  socket.on('data', (d) => {
    if (!conn || conn.socket !== socket) return;
    conn.buf = Buffer.concat([conn.buf, d]);
    while (queue.length && conn) {
      const r = parseReply(conn.buf);
      if (!r.complete) break;
      conn.buf = r.rest;
      const q = queue.shift()!;
      clearTimeout(q.timer);
      if (q.args === null) continue; // AUTH reply
      if (r.value instanceof Error) killConn(r.value);
      else q.resolve(r.value);
    }
  });
  socket.on('error', (e) => {
    if (!conn || conn.socket !== socket) return;
    killConn(e instanceof Error ? e : new Error(String(e)));
  });
  socket.on('close', () => {
    if (!conn || conn.socket !== socket) return;
    killConn(new Error('redis connection closed'));
  });
  socket.on('drain', pump);
  const start = () => {
    if (!conn || conn.socket !== socket) return;
    if (conn.authed) return;
    if (cfg.auth) socket.write(respEncode(['AUTH', cfg.auth]));
    conn.authed = true;
    pump();
  };
  socket.on('connect', start);
  if (socket.readyState === 'open') start();
}

async function redisCommand(args: string[], timeoutMs = 5000): Promise<unknown> {
  const cfg = parseRedisUrl();
  if (!cfg) throw new Error('INSIGHT_EXTRACTOR_REDIS_URL not set (legacy ASKCARD_REDIS_URL also honored)');
  return new Promise((resolve, reject) => {
    const q: QueuedCmd = {
      args,
      resolve,
      reject,
      t0: Date.now(),
      timer: setTimeout(() => killConn(new Error(`redis timeout after ${timeoutMs}ms`)), timeoutMs),
    };
    queue.push(q);
    if (!conn) {
      if (cfg.auth) {
        queue.unshift({
          args: null, resolve: () => {}, reject: () => {}, t0: Date.now(),
          timer: setTimeout(() => killConn(new Error('redis AUTH timed out')), timeoutMs),
        });
      }
      connectAndPump(cfg);
    } else if (conn.authed) {
      pump();
    }
    // else: still connecting — start() pumps after AUTH
  });
}

// Pre-warm: module load happens before the first request on Vercel, so the
// pooled connection is established while the function boots — real commands
// then cost one network round-trip, not a TLS handshake.
if (parseRedisUrl()) {
  redisCommand(['PING']).catch(() => { /* first real command retries */ });
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
      // INCRBY has no EX option — set the TTL with a separate EXPIRE.
      const v = await redisCommand(['INCRBY', key, String(amount)]);
      if (ttlSeconds) await redisCommand(['EXPIRE', key, String(ttlSeconds)]);
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

/** Typed JSON read (Redis STRING or local file). Null on missing/expired/malformed. */
export async function storeGetJson<T = unknown>(key: string): Promise<T | null> {
  if (parseRedisUrl()) {
    try {
      const v = await redisCommand(['GET', key]);
      if (typeof v !== 'string' || !v) return null;
      return JSON.parse(v) as T;
    } catch (e) { warnFallback(e); }
  }
  const d = fileRead(key);
  if (!d) return null;
  return d.v as T;
}

/** Typed JSON write (Redis STRING or local file). */
export async function storeSetJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (parseRedisUrl()) {
    try {
      const payload = JSON.stringify(value);
      await redisCommand(ttlSeconds ? ['SET', key, payload, 'EX', String(ttlSeconds)] : ['SET', key, payload]);
      return;
    } catch (e) { warnFallback(e); }
  }
  fileWrite(key, value, ttlSeconds);
}

/** Raw string read. Null on missing/expired. */
export async function storeGet(key: string): Promise<string | null> {
  if (parseRedisUrl()) {
    try {
      const v = await redisCommand(['GET', key]);
      return typeof v === 'string' ? v : null;
    } catch (e) { warnFallback(e); }
  }
  const d = fileRead(key);
  return d ? String(d.v) : null;
}

/** Delete a key (Redis DEL or local file unlink). */
export async function storeDel(key: string): Promise<void> {
  if (parseRedisUrl()) {
    try {
      await redisCommand(['DEL', key]);
      return;
    } catch (e) { warnFallback(e); }
  }
  try {
    ensureDataDir();
    const p = path.join(FILE_DIR, `${key}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch { /* ephemeral */ }
}

/** Which backend serves shared state right now. */
export function storeBackendName(): 'redis' | 'files' {
  return parseRedisUrl() ? 'redis' : 'files';
}

/**
 * Live probe of the shared backend (PING). Never throws — returns the
 * outcome, so routes can report it and diagnose connectivity.
 */
export async function storePing(timeoutMs = 5000): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const v = await redisCommand(['PING'], timeoutMs);
    return { ok: v === 'PONG', ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: (e as Error).message };
  }
}

function now() { return Date.now(); }
