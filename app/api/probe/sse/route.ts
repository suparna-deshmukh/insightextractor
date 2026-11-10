import { NextRequest } from 'next/server';
import net from 'net';
import tls from 'tls';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * TEMP diagnostic: streams a heartbeat tick every 5s for ?s seconds, and
 * optionally (mode=fetch) holds a long pending outbound fetch in parallel,
 * to isolate what kills long-lived SSE streams on this plan.
 */
export async function GET(req: NextRequest) {
  const seconds = Math.min(Math.max(Number(req.nextUrl.searchParams.get('s') || '120') || 120, 10), 280);
  const mode = req.nextUrl.searchParams.get('mode') || 'idle';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const t0 = Date.now();
      const send = (e: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ }
      };
      send({ type: 'log', text: `probe start mode=${mode} t+0ms uptime=${process.uptime().toFixed(1)}s`, tone: 'info' });
      let fetchDone: string | null = null;
      if (mode === 'fetch') {
        fetch('https://generativelanguage.googleapis.com/v1beta/models', {
          headers: { Authorization: `Bearer ${process.env.GEMINI_API_KEY || 'x'}` },
          signal: AbortSignal.timeout(seconds * 1000),
        }).then((r) => { fetchDone = `http ${r.status}`; }).catch((e) => { fetchDone = `err: ${(e as Error).message}`; });
      }
      if (mode === 'slowfetch') {
        // Hold a raw TCP+TLS socket to the Upstash DB (no commands) — a
        // pending outbound connection that never resolves.
        const rawT0 = Date.now();
        const urlRaw = (process.env.INSIGHT_EXTRACTOR_REDIS_URL || '').trim();
        let rawDone: string | null = null;
        if (urlRaw) {
          const u = new URL(urlRaw);
          const s = tls.connect({ host: u.hostname, port: Number(u.port) || 6379, servername: u.hostname });
          s.on('secureConnect', () => { send({ type: 'log', text: `raw socket established at t+${Date.now() - rawT0}ms`, tone: 'info' }); });
          s.on('error', (e) => { rawDone = `raw err: ${(e as Error).message} at t+${Date.now() - rawT0}ms`; send({ type: 'log', text: rawDone, tone: 'warn' }); });
          s.on('close', () => { if (!rawDone) { rawDone = `raw closed at t+${Date.now() - rawT0}ms`; send({ type: 'log', text: rawDone, tone: 'warn' }); } });
          setTimeout(() => { if (!rawDone) { s.destroy(); rawDone = `raw destroyed (timeout) at t+${Date.now() - rawT0}ms`; } }, seconds * 1000);
        } else {
          rawDone = 'raw: no redis url';
        }
        const rt = Date.now();
        fetch('https://httpbingo.org/delay/90', { signal: AbortSignal.timeout(140_000) })
          .then(async (r) => { fetchDone = `http ${r.status} after ${Date.now() - rt}ms`; })
          .catch((e) => { fetchDone = `err: ${(e as Error).message} after ${Date.now() - rt}ms`; });
        setInterval(() => {
          if (rawDone || fetchDone) {
            send({ type: 'log', text: `pending status: fetch=${fetchDone} raw=${rawDone}`, tone: 'info' });
          }
        }, 30_000);
      }
      const iv = setInterval(() => {
        send({ type: 'log', text: `tick t+${Date.now() - t0}ms uptime=${process.uptime().toFixed(1)}s fetch=${fetchDone}`, tone: 'info' });
      }, 5000);
      setTimeout(() => {
        clearInterval(iv);
        send({ type: 'log', text: `probe complete t+${Date.now() - t0}ms fetch=${fetchDone}`, tone: 'ok' });
        try { controller.close(); } catch { /* closed */ }
      }, seconds * 1000);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
