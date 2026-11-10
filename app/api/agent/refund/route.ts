import { NextRequest, NextResponse } from 'next/server';
import { clientUid, refundRun } from '@/lib/usage';
import { storeGet, storeDel } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * Refund a run slot when the stream is DROPPED mid-run (platform kill) —
 * the server-side catch can't run in that case, so the client reports it.
 * One-shot: the slot marker must exist, then it is deleted.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as any;
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }
  const slotKey = `insight-extractor:runslot:${token}`;
  const marker = await storeGet(slotKey);
  if (marker !== '1') return NextResponse.json({ ok: false, reason: 'nothing to refund' });
  await storeDel(slotKey);
  await refundRun(clientUid(req)).catch(() => {});
  return NextResponse.json({ ok: true });
}
