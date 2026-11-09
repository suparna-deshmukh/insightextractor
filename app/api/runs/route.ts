import { NextRequest, NextResponse } from 'next/server';
import { listRuns } from '@/lib/runs';
import { clientUid } from '@/lib/usage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return NextResponse.json({ runs: await listRuns(clientUid(req)) });
}
