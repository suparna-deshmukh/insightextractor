import { describe, expect, it } from 'vitest';
import { timeAgo, formatClock, countdown, nextPacificMidnight } from '@/lib/client/time';

const NOW = Date.parse('2026-11-14T12:00:00Z');

describe('timeAgo', () => {
  it('under a minute is just now', () => {
    expect(timeAgo(NOW - 10_000, NOW)).toBe('just now');
  });
  it('minutes', () => {
    expect(timeAgo(NOW - 5 * 60_000, NOW)).toBe('5 minutes ago');
  });
  it('hours', () => {
    expect(timeAgo(NOW - 3 * 3600_000, NOW)).toBe('3 hours ago');
  });
  it('yesterday', () => {
    expect(timeAgo(NOW - 86400_000 - 60_000, NOW)).toBe('yesterday');
  });
  it('over 30 days is an absolute date', () => {
    expect(timeAgo(NOW - 40 * 86400_000, NOW)).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
  });
});

describe('formatClock', () => {
  it('renders hour and minute', () => {
    expect(formatClock(Date.parse('2026-11-14T09:05:00Z'))).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('countdown', () => {
  it('2h 14m', () => expect(countdown((2 * 60 + 14) * 60_000)).toBe('2h 14m'));
  it('14m', () => expect(countdown(14 * 60_000)).toBe('14m'));
  it('under a minute', () => expect(countdown(20_000)).toBe('under a minute'));
});

describe('nextPacificMidnight', () => {
  const samples = [
    '2026-11-14T02:00:00Z',
    '2026-11-14T12:00:00Z',
    '2026-01-01T00:00:00Z',
    '2026-06-30T23:59:00Z',
    '2026-03-08T10:00:00Z',
  ];
  for (const s of samples) {
    it(`from ${s}`, () => {
      const now = new Date(s);
      const next = nextPacificMidnight(now);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
      expect(next.getTime() - now.getTime()).toBeLessThanOrEqual(86_400_000);
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(next);
      const h = Number(parts.find((p) => p.type === 'hour')?.value) % 24;
      const m = Number(parts.find((p) => p.type === 'minute')?.value);
      const sec = Number(parts.find((p) => p.type === 'second')?.value);
      expect(h * 3600 + m * 60 + sec).toBe(0);
    });
  }
});
