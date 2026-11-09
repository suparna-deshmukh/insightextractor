import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const out: Record<string, unknown> = {};
  const t0 = Date.now();
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/', { signal: AbortSignal.timeout(20000) });
    out.root = { status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    out.root = String(e);
  }
  const t1 = Date.now();
  const key = process.env.GEMINI_API_KEY ?? '';
  try {
    const r2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(30000) });
    const j = (await r2.json().catch(() => null)) as any;
    out.models = { status: r2.status, ms: Date.now() - t1, count: j?.models?.length ?? null, errMsg: j?.error?.message ?? null };
  } catch (e) {
    out.models = String(e);
  }
  return NextResponse.json(out);
}
