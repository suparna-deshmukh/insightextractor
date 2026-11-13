import type { SourceId } from './types';

export type SignalSource = SourceId;

// Word-boundary versions. The old app-signal regex had no boundaries, so
// "happy" or "apparel" matched "app".
const APP_RE = /\b(app|apps|application|applications|ios|android|iphone|mobile|play store|app store)\b/i;
const BRAND_RE = /\b(brand|saas|b2b|b2c|startup|company|product line|platform)\b/i;
const DEV_RE = /\b(developer|developers|dev|api|apis|sdk|open[- ]source|github|devtools?|cli|framework|library|software|saas|startup)\b/i;
const OSS_RE = /\b(open[- ]source|github|sdk|api|cli|framework|library|developer tools?|devtools?)\b/i;

export function detectSignals(text: string) {
  return { app: APP_RE.test(text), brand: BRAND_RE.test(text), dev: DEV_RE.test(text), oss: OSS_RE.test(text) };
}

// Order is the canonical display order everywhere.
export const SOURCE_ORDER: SourceId[] = ['reddit', 'google', 'hn', 'github', 'producthunt', 'appstore', 'play', 'youtube'];

export function recommendSources(text: string): SourceId[] {
  const s = detectSignals(text);
  const out = new Set<SourceId>(['reddit', 'google']);
  if (s.dev) out.add('hn');
  if (s.oss) out.add('github');
  if (s.app) {
    out.add('appstore');
    out.add('play');
  }
  return SOURCE_ORDER.filter((id) => out.has(id));
}

export const BRAND_INDUSTRIES = ['SaaS', 'B2B Services', 'Fintech', 'E-commerce', 'DevTools'];

export const showBrandField = (text: string, industry: string): boolean =>
  detectSignals(text).brand || BRAND_INDUSTRIES.includes(industry);
