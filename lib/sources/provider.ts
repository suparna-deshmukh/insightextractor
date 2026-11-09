import { EvidenceRecord, Plan, PipelineMode, TimeFrame } from '../types';

export interface Provider {
  id: string;
  name: string;
  requiresKey?: string;
  timeoutMs?: number;
  /** Fetches the shards (query/app slices) assigned to this provider. */
  fetch: (shards: string[], plan: Plan, tf: TimeFrame, mode: PipelineMode) => Promise<EvidenceRecord[]>;
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export function providerError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^https?:\/\/\S+\s*/, '').slice(0, 160);
}
