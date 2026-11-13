import { beforeEach, describe, expect, it } from 'vitest';
import { clearInflight, getInflight, setInflight } from '@/lib/client/inflight';
import type { InflightRecord } from '@/lib/client/inflight';
import { buildRequest, defaultForm } from '@/lib/client/form';

const NOW = Date.now();
const valid: InflightRecord = {
  token: 'rt_abc123xyz',
  request: buildRequest({ ...defaultForm, description: 'Why do people cancel meal-kit subscriptions in India?' }),
  startedAt: NOW - 60_000,
};

describe('inflight record', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips', () => {
    setInflight(valid);
    expect(getInflight(NOW)?.token).toBe('rt_abc123xyz');
  });

  it('returns null for malformed JSON', () => {
    localStorage.setItem('ie:inflight:v1', '{not json');
    expect(getInflight(NOW)).toBeNull();
  });

  it('returns null for wrong shape', () => {
    localStorage.setItem('ie:inflight:v1', JSON.stringify({ token: 42 }));
    expect(getInflight(NOW)).toBeNull();
    localStorage.setItem('ie:inflight:v1', JSON.stringify({ token: 'rt_abc123xyz', startedAt: NOW }));
    expect(getInflight(NOW)).toBeNull();
  });

  it('ignores and clears a record older than 6 hours', () => {
    setInflight({ ...valid, startedAt: NOW - 7 * 3600_000 });
    expect(getInflight(NOW)).toBeNull();
    expect(localStorage.getItem('ie:inflight:v1')).toBeNull();
  });

  it('clearInflight removes the record', () => {
    setInflight(valid);
    clearInflight();
    expect(getInflight(NOW)).toBeNull();
  });
});
