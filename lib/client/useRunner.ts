'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { runResearch, refund, type RunnerEvent } from './runner';
import { clearInflight, setInflight } from './inflight';
import { revalidateAfterRun } from './health';
import type { ClientRequest, RunResult } from './types';

export type SourceLive = { status: 'waiting' | 'done'; count?: number; warning?: string };

export type RunnerState = {
  phase: 'idle' | 'running' | 'done' | 'error';
  stageIndex: number;
  stageTotal: number;
  sources: Record<string, SourceLive>;
  log: Array<{ t: number; tone: string; text: string }>;
  notice: null | 'slow' | 'retry' | 'reconnect';
  startedAt: number;
  result?: RunResult;
  error?: { message: string; refunded: boolean };
};

const INITIAL: RunnerState = {
  phase: 'idle',
  stageIndex: 0,
  stageTotal: 6,
  sources: {},
  log: [],
  notice: null,
  startedAt: 0,
};

const NOTICE_TTL = 8000;
const SLOW_RE = /source|reddit|google|hacker|github|product|app store|play|youtube|route/i;

export function useRunner() {
  const [state, setState] = useState<RunnerState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef<ClientRequest | null>(null);
  const tokenRef = useRef('');
  const noticeTimer = useRef<number | null>(null);

  const clearNoticeLater = useCallback(() => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      setState((s) => (s.notice ? { ...s, notice: null } : s));
    }, NOTICE_TTL);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  const onEvent = useCallback(
    (e: RunnerEvent) => {
      setState((s) => {
        switch (e.type) {
          case 'stage':
            return { ...s, stageIndex: e.index, stageTotal: e.total, log: [...s.log, { t: Date.now(), tone: 'stage', text: e.name }] };
          case 'log': {
            const slow = e.tone === 'warn' && SLOW_RE.test(e.text);
            return { ...s, log: [...s.log, { t: e.t, tone: e.tone, text: e.text }], notice: slow ? 'slow' : s.notice };
          }
          case 'source':
            return { ...s, sources: { ...s.sources, [e.id]: { status: 'done', count: e.count, warning: e.warning } } };
          case 'step_done':
            return { ...s, log: [...s.log, { t: Date.now(), tone: 'info', text: 'Checkpoint saved — next stage starting' }] };
          case 'retry':
            return { ...s, notice: 'retry' };
          case 'reconnect':
            return { ...s, notice: 'reconnect' };
          case 'result':
            return { ...s, phase: 'done', result: e.result, stageIndex: s.stageTotal };
          case 'error':
            return { ...s, phase: 'error', error: { message: e.message, refunded: e.refunded } };
        }
      });
      if (e.type === 'stage' || e.type === 'step_done' || e.type === 'retry' || e.type === 'reconnect') {
        clearNoticeLater();
      }
      if (e.type === 'log' && e.tone === 'warn' && SLOW_RE.test(e.text)) clearNoticeLater();
    },
    [clearNoticeLater],
  );

  // In-flight bookkeeping: clear on done/error and refresh shared state.
  useEffect(() => {
    if (state.phase === 'done' || state.phase === 'error') {
      clearInflight();
      revalidateAfterRun();
    }
  }, [state.phase]);

  const start = useCallback(
    (request: ClientRequest, token: string, startedAt: number = Date.now()) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      requestRef.current = request;
      tokenRef.current = token;
      setState({ ...INITIAL, phase: 'running', startedAt });
      setInflight({ token, request, startedAt });
      void runResearch({ request, token, signal: controller.signal, onEvent });
    },
    [onEvent],
  );

  const resume = useCallback(
    (request: ClientRequest, token: string, startedAt: number) => {
      start(request, token, startedAt);
    },
    [start],
  );

  /** Stop the run and refund the slot. Returns the request so it can be kept as a draft. */
  const cancel = useCallback(async (): Promise<ClientRequest | null> => {
    abortRef.current?.abort();
    const token = tokenRef.current;
    const request = requestRef.current;
    if (token) await refund(token);
    clearInflight();
    revalidateAfterRun();
    setState((s) => ({ ...s, phase: 'idle', notice: null }));
    return request;
  }, []);

  return { state, request: requestRef.current, token: tokenRef.current, start, resume, cancel };
}
