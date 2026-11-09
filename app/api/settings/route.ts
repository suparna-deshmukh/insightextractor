import { NextRequest, NextResponse } from 'next/server';
import { getKey, setKey, hydrateStoredKeys } from '@/lib/keys';

export const dynamic = 'force-dynamic';

const BLOCKED = new Set(['PATH', 'HOME', 'PWD', 'NODE_ENV', 'NODE_OPTIONS', 'PORT', 'HOSTNAME']);

export async function GET() {
  await hydrateStoredKeys();
  return NextResponse.json({
    gemini: { set: Boolean(getKey('GEMINI_API_KEY')), model: getKey('GEMINI_MODEL') || process.env.GEMINI_MODEL || 'gemini-2.5-flash' },
    producthunt: { set: Boolean(getKey('PRODUCTHUNT_API_TOKEN')) },
    youtube: { set: Boolean(getKey('YOUTUBE_API_KEY')) },
    keys: Object.keys(process.env).filter((k) => /^[A-Z][A-Z0-9_]{2,63}$/.test(k) && !BLOCKED.has(k) && process.env[k]).map((k) => ({ key: k, masked: `${process.env[k]!.slice(0, 4)}…${process.env[k]!.slice(-3)}` })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as any;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const updated: string[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(k) || BLOCKED.has(k)) continue;
    await setKey(k, v.trim());
    updated.push(k);
  }
  if (!updated.length) return NextResponse.json({ error: 'No valid keys (names must be UPPER_SNAKE_CASE).' }, { status: 400 });
  return NextResponse.json({ ok: true, updated });
}
