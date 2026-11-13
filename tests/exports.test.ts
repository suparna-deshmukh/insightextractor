import { describe, expect, it } from 'vitest';
import { BOM, csvCell, evidenceCsv, fileNames, rawCsv, slug, withBom } from '@/lib/client/exports';
import type { RunResult } from '@/lib/client/types';

describe('slug', () => {
  it('lowercases, replaces non-alphanumerics, collapses and trims underscores', () => {
    expect(slug('Why do people stop?')).toBe('why_do_people_stop');
    expect(slug('  --Hello--  World--  ')).toBe('hello_world');
  });

  it('caps at 50 characters without a trailing underscore', () => {
    const s = slug('a-'.repeat(40));
    expect(s.length).toBeLessThanOrEqual(50);
    expect(s.endsWith('_')).toBe(false);
  });
});

describe('fileNames', () => {
  it('builds the four filenames', () => {
    expect(fileNames('Budget apps')).toEqual({
      md: 'insight_extractor_budget_apps_insights.md',
      csv: 'insight_extractor_budget_apps_evidence.csv',
      rawCsv: 'insight_extractor_budget_apps_raw_insights.csv',
      json: 'insight_extractor_budget_apps_data.json',
    });
  });
});

describe('csvCell', () => {
  it('prefixes formula-like cells with a quote', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe(`"'=SUM(A1:A2)"`);
    expect(csvCell('+1-2')).toBe(`"'+1-2"`);
    expect(csvCell('-5')).toBe(`"'-5"`);
    expect(csvCell('@mention')).toBe(`"'@mention"`);
  });

  it('quotes every cell and doubles inner quotes', () => {
    expect(csvCell('plain')).toBe('"plain"');
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""');
    expect(csvCell(42)).toBe('"42"');
  });
});

describe('evidenceCsv', () => {
  const result = {
    buckets: [{ bucket: { id: 1, name: 'Delivery delays' } as never, count: 1, share: 100, avgScore: 1, positive: 0, negative: 1, neutral: 0, bySource: [], topQuotes: [] }],
    labeled: [
      { id: 'r1', source: 'reddit', title: 'Late "again"', body: '', url: 'https://x', author: 'u/a', date: '2025-11-10', score: 5, bucket: 1, sentiment: 'negative' },
    ],
  } as unknown as RunResult;

  it('starts with a BOM and keeps the column set', () => {
    const csv = evidenceCsv(result);
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(BOM.length).split('\n');
    expect(lines[0]).toBe('id,source,bucket,sentiment,score,date,author,title,url');
    expect(lines[1]).toBe('"r1","reddit","1|Delivery delays","negative","5","2025-11-10","u/a","Late ""again""","https://x"');
  });

  it('withBom is idempotent', () => {
    expect(withBom(BOM + 'a')).toBe(BOM + 'a');
  });

  it('rawCsv adds the BOM only when missing', () => {
    expect(rawCsv({ rawCsv: 'a,b\n1,2' } as never)).toBe(BOM + 'a,b\n1,2');
    expect(rawCsv({ rawCsv: BOM + 'a,b' } as never)).toBe(BOM + 'a,b');
  });
});
