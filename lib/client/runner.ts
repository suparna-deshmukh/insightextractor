import type { ClientRequest, RunResult } from './types';
import { getUid } from './uid';

export type RunnerEvent =
  | { type: 'stage'; index: number; total: number; name: string }
  | { type: 'log'; tone: 'info' | 'ok' | 'warn' | 'error'; text: string; t: number }
  | { type: 'source'; id: string; count?: number; warning?: string }
  | { type: 'step_done' }
  | { type: 'retry'; n: number }
  | { type: 'reconnect'; n: number }
  | { type: 'result'; result: RunResult }
  | { type: 'error'; message: string; refunded: boolean };

const MAX_DROPS = 3;
const MAX_RETRIES = 6;
const RESUME_WAIT_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Refund the run slot. One-shot server-side; safe to call more than once. */
export async function refund(token: string): Promise<void> {
  await fetch('/api/agent/refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-insight-extractor-user': getUid() },
    body: JSON.stringify({ token }),
  }).catch(() => {});
}

/**
 * The run loop, extracted from the pre-redesign interface. Behaviour is unchanged:
 * one POST per stage, resume after a stream drop (max 3), model-retry cap of 6,
 * refund on fatal failure. `signal` stops everything and sends nothing further.
 */
export async function runResearch(args: {
  request: ClientRequest;
  token: string;
  signal: AbortSignal;
  onEvent: (e: RunnerEvent) => void;
}): Promise<void> {
  const { request, token, signal, onEvent } = args;
  let drops = 0;
  let retries = 0;
  let lastStage = -1;

  for (;;) {
    if (signal.aborted) return;
    let gotResult = false;
    let sawError = false;
    let hardFail: string | null = null;
    try {
      const res = await fetch('/api/agent/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-insight-extractor-user': getUid() },
        body: JSON.stringify({ ...request, runToken: token }),
        signal,
      });
      if (!res.ok || !res.body) {
        hardFail = `Server error ${res.status}`;
      } else {
        const reader = res.body.getReader();
        const onAbort = () => {
          void reader.cancel('aborted').catch(() => {});
        };
        signal.addEventListener('abort', onAbort, { once: true });
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              let e: Record<string, unknown>;
              try {
                e = JSON.parse(line.slice(6)) as Record<string, unknown>;
              } catch {
                continue;
              }
              if (e.type === 'stage') {
                if (typeof e.index === 'number' && e.index > lastStage) {
                  lastStage = e.index;
                  drops = 0;
                  retries = 0;
                }
                onEvent({ type: 'stage', index: Number(e.index), total: Number(e.total) || 0, name: String(e.stage ?? '') });
              } else if (e.type === 'log') {
                onEvent({ type: 'log', tone: (e.tone as 'info' | 'ok' | 'warn' | 'error') ?? 'info', text: String(e.text ?? ''), t: Date.now() });
              } else if (e.type === 'source') {
                onEvent({ type: 'source', id: String(e.source), count: typeof e.fetched === 'number' ? e.fetched : undefined, warning: e.warning ? String(e.warning) : undefined });
              } else if (e.type === 'step_done') {
                if (typeof e.stage === 'number' && e.stage > lastStage) {
                  lastStage = e.stage;
                  drops = 0;
                  retries = 0;
                }
                onEvent({ type: 'step_done' });
              } else if (e.type === 'step_retry') {
                retries += 1;
                if (retries > MAX_RETRIES) {
                  await refund(token);
                  onEvent({ type: 'error', message: 'The model kept failing across retries — your slot was refunded.', refunded: true });
                  return;
                }
                onEvent({ type: 'retry', n: retries });
              } else if (e.type === 'result') {
                gotResult = true;
                onEvent({ type: 'result', result: e.result as RunResult });
              } else if (e.type === 'error') {
                sawError = true;
                onEvent({ type: 'error', message: String(e.message ?? ''), refunded: /refund/i.test(String(e.message ?? '')) });
              }
            }
          }
          if (signal.aborted) return;
        }
        signal.removeEventListener('abort', onAbort);
      }
    } catch (err) {
      if (signal.aborted) return;
      drops += 1;
      if (drops >= MAX_DROPS) {
        await refund(token);
        onEvent({ type: 'error', message: `Connection dropped mid-run (${(err as Error).message || 'network error'}). Your slot was refunded.`, refunded: true });
        return;
      }
      onEvent({ type: 'reconnect', n: drops });
    }
    if (signal.aborted) return;
    if (gotResult || sawError) return;
    if (hardFail) {
      await refund(token);
      onEvent({ type: 'error', message: `${hardFail} — your slot was refunded.`, refunded: true });
      return;
    }
    // Stream closed without a result: the next POST continues from the last checkpoint.
    await sleep(RESUME_WAIT_MS);
  }
}
