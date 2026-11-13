'use client';
import useSWR, { mutate } from 'swr';
import { getUid } from './uid';
import type { HealthView, RunSummary } from './types';

const SWR_OPTS = {
  refreshInterval: 60_000,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 5_000,
} as const;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'x-insight-extractor-user': getUid() } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function useHealth() {
  return useSWR<HealthView>('/api/sources/health', (url) => fetchJson(url), SWR_OPTS);
}

export function useRuns() {
  return useSWR<{ runs: RunSummary[] }>('/api/runs', (url) => fetchJson(url), SWR_OPTS);
}

export interface Usage {
  runsLeft: number;
  runsTotal: number;
  resetsAt: number;
  capacityUsed: number;
  capacityTotal: number;
  capacityOut: boolean;
  basicMode: boolean;
}

export function useUsage(): Usage | null {
  const { data: health } = useHealth();
  if (!health) return null;
  const rw = health.runWindow;
  const usage = health.usage;
  return {
    runsLeft: rw ? Math.max(0, rw.limit - rw.used) : 0,
    runsTotal: rw?.limit ?? 0,
    resetsAt: rw?.resetsAt ?? 0,
    capacityUsed: usage?.totalUsed ?? 0,
    capacityTotal: usage?.totalQuota ?? 0,
    capacityOut: Boolean(usage && usage.totalQuota > 0 && usage.totalUsed >= usage.totalQuota),
    basicMode: !health.gemini,
  };
}

/** Refresh health and run lists after events that change them. */
export function revalidateAfterRun(): void {
  void mutate('/api/sources/health');
  void mutate('/api/runs');
}
