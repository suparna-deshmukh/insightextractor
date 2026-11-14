import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runResearch, refund } from '@/lib/client/runner';
import type { RunnerEvent } from '@/lib/client/runner';
import type { ClientRequest } from '@/lib/client/types';
import type { RunResult as R } from '@/lib/client/types';

const encoder = new TextEncoder();

function sse(...events: Record<string, unknown>[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      controller.close();
    },
  });
}

function failingStream(afterEvents: Record<string, unknown>[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const e of afterEvents) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      controller.error(new Error('socket closed'));
    },
  });
}

const RESULT: R = {
  topic: 'T', description: 'd'.repeat(40), objective: 'problem-discovery',
  timeframe: { preset: '30d' },
  plan: { keywords: [], queries: {}, apps: [], subreddits: [], lookFor: [], hypotheses: [], problemStatement: '', objective: '' },
  totalRecords: 10, keptRecords: 10, irrelevantDropped: 0,
  perSource: [], buckets: [], trend: [], labeled: [], rawCsv: '', sqlAudit: [],
  report: '', model: 'm', usedLlm: true, durationMs: 1000,
} as R;

const REQUEST = { topic: 'T', description: 'd'.repeat(40), objective: 'problem-discovery', competitors: [], industry: '', audience: '', keywords: [], focusAreas: [], compareCompetitors: false, reportLength: 'standard', tone: 'neutral', appsHint: [], brandHint: '', platforms: ['reddit'], timeframes: { default: { preset: '30d' }, overrides: {} }, format: 'one-pager', mode: 'rapid' } as unknown as ClientRequest;

function collect(run: Promise<void>) {
  const events: RunnerEvent[] = [];
  return { events, done: run.then(() => undefined) };
}

describe('runResearch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('happy path emits stage, source and result in order', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: sse(
      { type: 'stage', stage: 'plan', index: 0, total: 6 },
      { type: 'log', text: 'planning' },
      { type: 'source', source: 'reddit', fetched: 5, kept: 4 },
      { type: 'stage', stage: 'fetch', index: 1, total: 6 },
      { type: 'step_done', stage: 1 },
      { type: 'result', result: RESULT },
    ) } as unknown as Response);
    const { events, done } = collect(runResearch({ request: REQUEST, token: 'rt_test_token_1', signal: new AbortController().signal, onEvent: (e) => events.push(e) }));
    await done;
    expect(events.map((e) => e.type)).toEqual(['stage', 'log', 'source', 'stage', 'step_done', 'result']);
    expect((events[2] as { count?: number }).count).toBe(5);
    expect((events[5] as { result: R }).result.topic).toBe('T');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).runToken).toBe('rt_test_token_1');
  });

  it('a dropped connection resumes after 1.5s and finishes', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: failingStream([{ type: 'stage', stage: 'plan', index: 0, total: 6 }]) } as unknown as Response);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: sse({ type: 'result', result: RESULT }) } as unknown as Response);
    const { events, done } = collect(runResearch({ request: REQUEST, token: 'rt_test_token_1', signal: new AbortController().signal, onEvent: (e) => events.push(e) }));
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.some((e) => e.type === 'reconnect')).toBe(true);
    expect(events[events.length - 1].type).toBe('result');
  }, 10_000);

  it('4 drops end in an error with refunded: true and a refund call', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('refund')) return { ok: true, status: 200, body: null } as unknown as Response;
      return { ok: true, status: 200, body: failingStream([]) } as unknown as Response;
    });
    const { events, done } = collect(runResearch({ request: REQUEST, token: 'rt_test_token_1', signal: new AbortController().signal, onEvent: (e) => events.push(e) }));
    await done;
    const err = events.find((e) => e.type === 'error');
    expect(err).toMatchObject({ type: 'error', refunded: true });
    expect(String((err as { message: string }).message)).toContain('dropped');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('refund'))).toBe(true);
  }, 20_000);

  it('7 retry events end in an error with refunded: true', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('refund')) return { ok: true, status: 200, body: null } as unknown as Response;
      return {
        ok: true,
        status: 200,
        body: sse(...Array.from({ length: 7 }, () => ({ type: 'step_retry', reason: 'model down' }))),
      } as unknown as Response;
    });
    const { events, done } = collect(runResearch({ request: REQUEST, token: 'rt_test_token_1', signal: new AbortController().signal, onEvent: (e) => events.push(e) }));
    await done;
    const err = events.find((e) => e.type === 'error');
    expect(err).toMatchObject({ type: 'error', refunded: true });
    expect(String((err as { message: string }).message)).toContain('model');
  });

  it('an AbortSignal stops the loop and sends nothing further', async () => {
    const fetchMock = vi.mocked(fetch);
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'stage', stage: 'plan', index: 0, total: 6 })}\n\n`));
        },
        // never closes
      });
      return { ok: true, status: 200, body: stream } as unknown as Response;
    });
    const { events, done } = collect(runResearch({ request: REQUEST, token: 'rt_test_token_1', signal: controller.signal, onEvent: (e) => events.push(e) }));
    await new Promise((r) => setTimeout(r, 50));
    const callsBefore = fetchMock.mock.calls.length;
    controller.abort();
    await done;
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(events.some((e) => e.type === 'result' || e.type === 'error')).toBe(false);
  });

  it('refund posts the token', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: null } as unknown as Response);
    await refund('rt_test_token_1');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ token: 'rt_test_token_1' });
  });
});
