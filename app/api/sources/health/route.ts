import { NextRequest, NextResponse } from 'next/server';
import { SOURCE_LIST } from '@/lib/sources';
import { getKey, hydrateStoredKeys } from '@/lib/keys';
import { geminiUsage, hasGeminiKey } from '@/lib/gemini';
import { loadHealth } from '@/lib/health';
import { runWindowFor, clientUid } from '@/lib/usage';
import { storeBackendName, storePing } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  console.log(`[health] request t+${process.uptime().toFixed(1)}s uptime`);
  await hydrateStoredKeys();
  const health = await loadHealth();
  const sources = SOURCE_LIST.map((s) => {
    const keyless = s.providers.every((p) => !p.requiresKey);
    const ready = keyless || s.providers.some((p) => !p.requiresKey || getKey(p.requiresKey));
    const providers = s.providers.map((p) => {
      const h = health[`${s.meta.id}:${p.id}`] ?? { fails: 0, successes: 0 };
      return {
        id: p.id,
        name: p.name,
        keyless: !p.requiresKey,
        requiresKey: p.requiresKey,
        keySet: p.requiresKey ? Boolean(getKey(p.requiresKey)) : true,
        fails: h.fails ?? 0,
        successes: h.successes ?? 0,
        lastError: h.lastError,
      };
    });
    return {
      id: s.meta.id, label: s.meta.label, icon: s.meta.icon, tagline: s.meta.tagline,
      keyless, ready, keyHint: s.meta.keyHint, providers,
    };
  });
  return NextResponse.json({
    gemini: hasGeminiKey(),
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    sources,
    usage: await geminiUsage(),
    runWindow: await runWindowFor(clientUid(req)),
    store: {
      backend: storeBackendName(),
      ...(storeBackendName() === 'redis' ? await storePing() : {}),
      region: process.env.VERCEL_REGION || 'local',
      ms: Date.now() - t0,
    },
  });
}
