import { NextRequest, NextResponse } from 'next/server';
import { getRun } from '@/lib/runs';
import { clientUid } from '@/lib/usage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(clientUid(req), id);
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  return NextResponse.json(run);
}
