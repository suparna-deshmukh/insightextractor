import { describe, expect, it } from 'vitest';
import { buildRequest, changeCount, defaultForm, splitList, validate } from '@/lib/client/form';
import type { FormState } from '@/lib/client/form';

const today = '2026-11-14';
const form = (over: Partial<FormState> = {}): FormState => ({ ...defaultForm, description: 'Why do people cancel meal-kit subscriptions in India?', ...over });

describe('buildRequest', () => {
  it('defaults match the old all-defaults request (except derived topic)', () => {
    const req = buildRequest(form(), today);
    expect(req).toEqual({
      topic: 'Why do people cancel meal-kit subscriptions in India',
      description: 'Why do people cancel meal-kit subscriptions in India?',
      objective: 'problem-discovery',
      competitors: [],
      industry: '',
      audience: '',
      keywords: [],
      focusAreas: [],
      compareCompetitors: false,
      reportLength: 'standard',
      tone: 'neutral',
      appsHint: [],
      brandHint: '',
      platforms: ['reddit', 'google'],
      timeframes: { default: { preset: '30d' }, overrides: {} },
      format: 'one-pager',
      mode: 'rapid',
    });
  });

  it('maps goal, style, depth to stored values', () => {
    const req = buildRequest(form({ goal: 'competitors', style: 'indepth', depth: 'deep' }), today);
    expect(req.objective).toBe('competitor-teardown');
    expect(req.format).toBe('full-report');
    expect(req.mode).toBe('deep');
  });

  it('custom dates are sent only for the custom preset', () => {
    expect(buildRequest(form({ time: { preset: 'custom', start: '2026-09-01', end: '2026-10-01' } }), today).timeframes.default)
      .toEqual({ preset: 'custom', start: '2026-09-01', end: '2026-10-01' });
    expect(buildRequest(form({ time: { preset: '1y' } }), today).timeframes.default).toEqual({ preset: '1y' });
  });

  it('appsHint only when a store source is selected, trimmed to 6', () => {
    const names = 'a, b, c, d, e, f, g';
    expect(buildRequest(form({ apps: names }), today).appsHint).toEqual([]);
    expect(buildRequest(form({ apps: names, sources: ['reddit', 'play'] }), today).appsHint).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('compareCompetitors follows competitors plus the checkbox', () => {
    expect(buildRequest(form({ competitors: 'A, B' }), today).compareCompetitors).toBe(true);
    expect(buildRequest(form({ competitors: 'A, B', compare: false }), today).compareCompetitors).toBe(false);
    expect(buildRequest(form({ competitors: '', compare: true }), today).compareCompetitors).toBe(false);
  });
});

describe('validate', () => {
  it('short description fails first', () => {
    expect(validate(form({ description: 'too short' }), today)).toMatchObject({ field: 'description' });
  });
  it('no sources fails second', () => {
    expect(validate(form({ sources: [] }), today)).toMatchObject({ field: 'sources' });
  });
  it('custom dates: valid', () => {
    expect(validate(form({ time: { preset: 'custom', start: '2026-09-01', end: '2026-10-01' } }), today)).toBeNull();
  });
  it('custom dates: start after end', () => {
    expect(validate(form({ time: { preset: 'custom', start: '2026-10-01', end: '2026-09-01' } }), today)).toMatchObject({ field: 'dates' });
  });
  it('custom dates: future date', () => {
    expect(validate(form({ time: { preset: 'custom', start: '2026-11-01', end: '2026-12-01' } }), today)).toMatchObject({ field: 'dates' });
  });
  it('custom dates: one missing', () => {
    expect(validate(form({ time: { preset: 'custom', start: '2026-09-01' } }), today)).toMatchObject({ field: 'dates' });
  });
});

describe('splitList', () => {
  it('splits, trims, dedupes case-insensitively and respects max', () => {
    expect(splitList('a, b, A,  c ,a', 3)).toEqual(['a', 'b', 'c']);
    expect(splitList('x', 2)).toEqual(['x']);
    expect(splitList('', 5)).toEqual([]);
  });
});

describe('changeCount', () => {
  it('is 0 for defaults', () => expect(changeCount(form())).toBe(0));
  it('counts non-default and non-empty fields', () => {
    expect(changeCount(form({ name: 'N', industry: 'Fintech', style: 'brief', length: 'detailed' }))).toBe(4);
  });
  it('counts an unticked comparison when competitors exist', () => {
    expect(changeCount(form({ competitors: 'A, B', compare: false }))).toBe(2);
  });
});
