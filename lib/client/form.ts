import { copy } from '@/lib/copy';
import type { ClientRequest, SourceId } from './types';
import { SOURCE_ORDER, showBrandField } from './signals';
import { deriveTitle } from './title';

export type GoalKey = 'problem' | 'validate' | 'launch' | 'competitors' | 'prioritize';
export type StyleKey = 'standard' | 'brief' | 'indepth' | 'sheet';
export type TimePreset = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';

export type FormState = {
  description: string;
  goal: GoalKey;
  name: string;
  industry: string;
  audience: string;
  competitors: string;
  brand: string;
  keywords: string;
  /** Indexes into FOCUS_AREAS. */
  focusAreas: number[];
  compare: boolean;
  compareTouched: boolean;
  style: StyleKey;
  length: 'concise' | 'standard' | 'detailed';
  tone: 'formal' | 'neutral' | 'conversational';
  depth: 'quick' | 'deep';
  time: { preset: TimePreset; start?: string; end?: string };
  sources: SourceId[];
  sourcesTouched: boolean;
  apps: string;
};

export const defaultForm: FormState = {
  description: '',
  goal: 'problem',
  name: '',
  industry: '',
  audience: '',
  competitors: '',
  brand: '',
  keywords: '',
  focusAreas: [],
  compare: true,
  compareTouched: false,
  style: 'standard',
  length: 'standard',
  tone: 'neutral',
  depth: 'quick',
  time: { preset: '30d' },
  sources: ['reddit', 'google'],
  sourcesTouched: false,
  apps: '',
};

export const splitList = (s: string, max: number): string[] => {
  const seen = new Set<string>();
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => {
      const k = x.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max);
};

const GOAL_TO_OBJECTIVE: Record<GoalKey, ClientRequest['objective']> = {
  problem: 'problem-discovery',
  validate: 'product-validation',
  launch: 'post-launch',
  competitors: 'competitor-teardown',
  prioritize: 'feature-prioritization',
};

const STYLE_TO_FORMAT: Record<StyleKey, ClientRequest['format']> = {
  standard: 'one-pager',
  brief: 'exec-brief',
  indepth: 'full-report',
  sheet: 'raw-data',
};

// The existing eight focus-area values, in the same order the old UI showed them.
export const FOCUS_AREAS = [
  'Features & gaps',
  'Pricing & monetization',
  'UX & usability',
  'Performance & reliability',
  'Security & privacy',
  'Support & onboarding',
  'Integrations',
  'Marketing & positioning',
];

export const INDUSTRIES = [
  'SaaS', 'E-commerce', 'Fintech', 'Healthtech', 'Edtech', 'DevTools', 'AI / ML', 'Consumer',
  'Travel', 'Real Estate', 'Gaming', 'Media & Entertainment', 'HR / Talent', 'Logistics',
  'Cybersecurity', 'Marketing', 'Legal', 'Construction', 'Agriculture', 'Hospitality',
  'Automotive', 'Retail', 'Food & Beverage', 'Fashion', 'Sports & Fitness', 'Pets', 'Beauty',
  'Home & Garden', 'B2B Services', 'Insurance', 'Telecom', 'Energy', 'Manufacturing',
  'Non-profit', 'Government', 'Research / Academia', 'Healthcare', 'Other',
];

export const AUDIENCES = [
  'B2B SaaS buyers', 'Startups', 'Enterprises', 'SMBs', 'Developers', 'Designers', 'Marketers',
  'Product managers', 'Data analysts', 'Students', 'Teachers', 'Parents', 'Seniors', 'Gen Z',
  'Millennials', 'Professionals', 'Remote workers', 'Freelancers', 'Creators',
  'Healthcare workers', 'Finance professionals', 'Shoppers', 'Tech-savvy users',
  'Budget-conscious', 'Luxury buyers', 'Ops teams', 'Other',
];

export function buildRequest(form: FormState, today: string = new Date().toISOString().slice(0, 10)): ClientRequest {
  void today;
  const competitors = splitList(form.competitors, 10);
  const storesSelected = form.sources.includes('appstore') || form.sources.includes('play');
  return {
    topic: form.name.trim() || deriveTitle(form.description),
    description: form.description.trim(),
    objective: GOAL_TO_OBJECTIVE[form.goal],
    competitors,
    industry: form.industry.trim(),
    audience: form.audience.trim(),
    keywords: splitList(form.keywords, 10),
    focusAreas: form.focusAreas.map((i) => FOCUS_AREAS[i]).filter((x): x is string => Boolean(x)),
    compareCompetitors: competitors.length > 0 && form.compare,
    reportLength: form.length,
    tone: form.tone,
    appsHint: storesSelected ? splitList(form.apps, 6) : [],
    brandHint: showBrandField(form.description, form.industry) ? form.brand.trim() : '',
    platforms: SOURCE_ORDER.filter((id) => form.sources.includes(id)),
    timeframes: {
      default:
        form.time.preset === 'custom'
          ? { preset: 'custom', start: form.time.start, end: form.time.end }
          : { preset: form.time.preset },
      overrides: {},
    },
    format: STYLE_TO_FORMAT[form.style],
    mode: form.depth === 'deep' ? 'deep' : 'rapid',
  };
}

export type ValidationResult = { field: 'description' | 'sources' | 'dates'; message: string } | null;

export function validate(form: FormState, today: string = new Date().toISOString().slice(0, 10)): ValidationResult {
  if (form.description.trim().length < 30) {
    return { field: 'description', message: copy.home.validation.question };
  }
  if (form.sources.length === 0) {
    return { field: 'sources', message: copy.home.validation.sources };
  }
  if (form.time.preset === 'custom') {
    if (!form.time.start || !form.time.end) {
      return { field: 'dates', message: copy.home.validation.datesBoth };
    }
    if (form.time.start > form.time.end) {
      return { field: 'dates', message: copy.home.validation.datesOrder };
    }
    if (form.time.start > today || form.time.end > today) {
      return { field: 'dates', message: copy.home.validation.datesFuture };
    }
  }
  return null;
}

/** How many Fine-tune fields differ from the defaults. */
export function changeCount(form: FormState): number {
  let n = 0;
  if (form.name.trim()) n++;
  if (form.industry.trim()) n++;
  if (form.audience.trim()) n++;
  if (form.competitors.trim()) n++;
  if (form.brand.trim()) n++;
  if (form.keywords.trim()) n++;
  if (form.focusAreas.length > 0) n++;
  if (form.competitors.trim() && !form.compare) n++;
  if (form.style !== 'standard') n++;
  if (form.length !== 'standard') n++;
  if (form.tone !== 'neutral') n++;
  return n;
}
