import { NextRequest } from 'next/server';

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
        const t = Date.now();
        fetch('https://httpbin.org/delay/90', { signal: AbortSignal.timeout(150_000) })
          .then((r) => { fetchDone = `http ${r.status} after ${Date.now() - t}ms`; })
          .catch((e) => { fetchDone = `err: ${(e as Error).message} after ${Date.now() - t}ms`; });
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
