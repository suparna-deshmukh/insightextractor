import { describe, expect, it } from 'vitest';
import { detectSignals, recommendSources, showBrandField } from '@/lib/client/signals';

describe('recommendSources', () => {
  it('budgeting apps -> reddit, google, app stores', () => {
    expect(recommendSources('Why do people stop using budgeting apps after a few weeks?')).toEqual(['reddit', 'google', 'appstore', 'play']);
  });
  it('developer CLI -> reddit, google, hn, github', () => {
    expect(recommendSources('What do developers hate about our open-source CLI?')).toEqual(['reddit', 'google', 'hn', 'github']);
  });
  it('meal-kit subscriptions -> reddit, google only', () => {
    expect(recommendSources('Why do people cancel meal-kit subscriptions in India?')).toEqual(['reddit', 'google']);
  });
  it('restaurant app -> app stores included', () => {
    expect(recommendSources('Would small restaurants pay for an app that manages online orders?')).toEqual(['reddit', 'google', 'appstore', 'play']);
  });
  it('SaaS API pricing -> hn and github', () => {
    expect(recommendSources("Is my SaaS startup's API pricing fair?")).toEqual(['reddit', 'google', 'hn', 'github']);
  });
  it('does not trigger the app signal on "happy apparel"', () => {
    expect(detectSignals('I love happy apparel').app).toBe(false);
    expect(recommendSources('I love happy apparel')).toEqual(['reddit', 'google']);
  });
});

describe('showBrandField', () => {
  it('true for startup text', () => expect(showBrandField('our startup is growing', '')).toBe(true));
  it('true for a brand industry', () => expect(showBrandField('we sell meal kits', 'Fintech')).toBe(true));
  it('false otherwise', () => expect(showBrandField('we sell meal kits', 'Food & Beverage')).toBe(false));
});
