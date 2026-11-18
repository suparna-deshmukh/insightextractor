import { describe, expect, it } from 'vitest';
import { parseReport, toSentenceCase } from '@/lib/client/report';

const report = [
  '# My Research Report',
  '',
  '## 1. SNAPSHOT',
  'Short version text.',
  '',
  '## 2. TOP INSIGHT BUCKETS',
  '| Theme | Share |',
  '',
  '## 3. WHAT USERS LOVE',
  'Love text.',
  '',
  '## 4. WHAT USERS HATE',
  'Hate text.',
  '',
  '## 5. UNMET NEEDS & FEATURE REQUESTS',
  'Needs text.',
  '',
  '## 6. VOICE OF THE USER',
  '> A quote',
  '',
  '## 7. MOMENTUM & TRENDS',
  'Trend text.',
  '',
  '## 8. RECOMMENDATIONS',
  '1. Do a thing',
  '',
  '## 9. METHOD & DATA APPENDIX',
  '### Sub heading inside method',
  'Details.',
].join('\n');

describe('parseReport', () => {
  it('parses nine numbered sections to nine known keys', () => {
    const sections = parseReport(report);
    expect(sections.map((s) => s.key)).toEqual([
      'snapshot', 'themes', 'love', 'hate', 'needs', 'voices', 'trends', 'recs', 'method',
    ]);
  });

  it('parses unnumbered headings', () => {
    const sections = parseReport('## SNAPSHOT\nBody.');
    expect(sections[0].key).toBe('snapshot');
    expect(sections[0].md).toBe('Body.');
  });

  it('assigns unknown headings the other key', () => {
    const sections = parseReport('## SOMETHING WEIRD\nBody.');
    expect(sections[0].key).toBe('other');
    expect(sections[0].heading).toBe('SOMETHING WEIRD');
  });

  it('matches hypothesis headings to the hypotheses key', () => {
    const sections = parseReport('## DO THE HYPOTHESES HOLD?\nBody.');
    expect(sections[0].key).toBe('hypotheses');
  });

  it('drops the # title line before the first section', () => {
    const sections = parseReport('# Title\n\n## SNAPSHOT\nBody.');
    expect(sections).toHaveLength(1);
    expect(sections[0].md).toBe('Body.');
  });

  it('maps DATA NOTE to the dataNote key', () => {
    const sections = parseReport('## DATA NOTE\nGaps here.');
    expect(sections[0].key).toBe('dataNote');
  });

  it('returns an empty array for an empty string', () => {
    expect(parseReport('')).toEqual([]);
  });

  it('keeps ### sub-headings inside the section markdown', () => {
    const sections = parseReport(report);
    const method = sections.find((s) => s.key === 'method');
    expect(method?.md).toContain('### Sub heading inside method');
    expect(method?.md).toContain('Details.');
  });

  it('trims section markdown', () => {
    const sections = parseReport('## SNAPSHOT\n\n  Body.  \n\n');
    expect(sections[0].md).toBe('Body.');
  });
});

describe('toSentenceCase', () => {
  it('lowercases and capitalizes the first letter', () => {
    expect(toSentenceCase('RECOMMENDATIONS')).toBe('Recommendations');
    expect(toSentenceCase('What to Do')).toBe('What to do');
  });
});

import { buildFallbackReport } from '@/lib/report';
import type { BucketStats, EvidenceRecord, Plan, RunRequest } from '@/lib/types';

const req = {
  topic: 'Budgeting apps',
  description: 'Why do people stop using budgeting apps after a few weeks?',
  objective: 'problem-discovery' as const,
  platforms: ['reddit', 'google'] as const,
  timeframes: { default: { preset: '30d' as const } },
} as unknown as RunRequest;

const plan = { keywords: ['budgeting app'] } as unknown as Plan;

function stats(quotes: EvidenceRecord[]): BucketStats[] {
  return [
    {
      bucket: { id: 1, name: 'Retention friction', kind: 'pain', description: 'test bucket' },
      count: 2, share: 100, avgScore: 10, positive: 0, negative: 1, neutral: 1,
      bySource: [{ source: 'google', count: 2 }],
      topQuotes: quotes,
    },
  ];
}

describe('buildFallbackReport voice of the user', () => {
  it('never quotes Google Autocomplete search phrases as user voices', () => {
    const md = buildFallbackReport(req, plan, stats([
      { id: 'g1', source: 'google', title: 'why do people stop believing in god', body: 'Autocomplete suggestion for "Why do people stop" — indicates current search demand.', date: '2026-11-18', score: 5 } as EvidenceRecord,
      { id: 'g2', source: 'google', title: 'why do people leave reviews', body: 'Autocomplete suggestion for "Why do people stop review".', date: '2026-11-18', score: 4 } as EvidenceRecord,
    ]));
    expect(md).not.toContain('believing in god');
    expect(md).not.toContain('Autocomplete suggestion');
    expect(md).toContain('No verbatim user statements');
  });

  it('quotes real user statements and skips autocomplete siblings', () => {
    const md = buildFallbackReport(req, plan, stats([
      { id: 'r1', source: 'reddit', title: 'I deleted the app', body: 'It stopped reminding me. Gave up after two months.', date: '2026-10-02', score: 12 } as EvidenceRecord,
      { id: 'g1', source: 'google', title: 'why do people stop taking fosamax', body: 'Autocomplete suggestion.', date: '2026-11-18', score: 9 } as EvidenceRecord,
    ]));
    expect(md).toContain('I deleted the app');
    expect(md).toContain('[Reddit, 2026-10-02]');
    expect(md).not.toContain('fosamax');
  });
});
