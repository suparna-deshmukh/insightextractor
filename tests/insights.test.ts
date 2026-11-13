import { describe, expect, it } from 'vitest';
import { kindLabel, kindOf, sentimentLabel, sentimentText, sourceList, timeWords, trimQuote } from '@/lib/client/insights';

describe('sentimentLabel', () => {
  it('is negative when negative share >= 60%', () => {
    expect(sentimentLabel({ positive: 10, negative: 81, neutral: 9 })).toEqual({ key: 'negative', pct: 81 });
  });

  it('is positive when positive share >= 60%', () => {
    expect(sentimentLabel({ positive: 72, negative: 10, neutral: 18 })).toEqual({ key: 'positive', pct: 72 });
  });

  it('is mixed otherwise, with the larger share', () => {
    expect(sentimentLabel({ positive: 40, negative: 35, neutral: 25 })).toEqual({ key: 'mixed', pct: 40 });
  });

  it('is mixed with pct 0 for zero totals', () => {
    expect(sentimentLabel({ positive: 0, negative: 0, neutral: 0 })).toEqual({ key: 'mixed', pct: 0 });
  });

  it('formats display text', () => {
    expect(sentimentText({ positive: 10, negative: 81, neutral: 9 })).toBe('Mostly negative (81%)');
    expect(sentimentText({ positive: 72, negative: 10, neutral: 18 })).toBe('Mostly positive (72%)');
    expect(sentimentText({ positive: 40, negative: 35, neutral: 25 })).toBe('Mixed');
  });
});

describe('trimQuote', () => {
  it('returns short text unchanged (whitespace collapsed)', () => {
    expect(trimQuote('  a   b \n c ')).toBe('a b c');
  });

  it('cuts at the last word boundary and adds an ellipsis', () => {
    const s = 'aa '.repeat(100).trim(); // 300 chars, spaces every 3
    const out = trimQuote(s, 260);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(261);
    expect(out.slice(0, -1).split(' ').filter(Boolean).length).toBeLessThan(s.split(' ').length);
  });

  it('cuts exactly at max when there is no word boundary', () => {
    const s = 'x'.repeat(300);
    const out = trimQuote(s, 260);
    expect(out).toBe('x'.repeat(260) + '…');
  });
});

describe('timeWords', () => {
  it('maps presets to phrases', () => {
    expect(timeWords({ preset: '7d' })).toBe('the past week');
    expect(timeWords({ preset: '30d' })).toBe('the past month');
    expect(timeWords({ preset: '90d' })).toBe('the past 3 months');
    expect(timeWords({ preset: '1y' })).toBe('the past year');
    expect(timeWords({ preset: 'all' })).toBe('all time');
  });

  it('formats custom ranges as day short-month pairs', () => {
    expect(timeWords({ preset: 'custom', start: '2025-10-12', end: '2025-11-14' })).toBe('12 Oct to 14 Nov');
  });
});

describe('sourceList', () => {
  it('joins one, two and three labels', () => {
    expect(sourceList(['reddit'])).toBe('Reddit');
    expect(sourceList(['reddit', 'hn'])).toBe('Reddit and Hacker News');
    expect(sourceList(['reddit', 'hn', 'github'])).toBe('Reddit, Hacker News and GitHub');
  });

  it('summarizes more than three', () => {
    expect(sourceList(['reddit', 'hn', 'github', 'google'])).toBe('Reddit, Hacker News and 2 more');
  });
});

describe('kindOf / kindLabel', () => {
  it('maps the three known kinds', () => {
    expect(kindOf('pain')).toBe('pain');
    expect(kindOf('praise')).toBe('praise');
    expect(kindOf('feature-request')).toBe('feature-request');
    expect(kindLabel('pain')).toBe('Problem');
    expect(kindLabel('praise')).toBe('Praise');
    expect(kindLabel('feature-request')).toBe('Request');
  });

  it('falls back to other and displays the raw kind with spaces', () => {
    expect(kindOf('confusion')).toBe('other');
    expect(kindLabel('confusion')).toBe('confusion');
    expect(kindLabel('price-gap')).toBe('price gap');
  });
});
