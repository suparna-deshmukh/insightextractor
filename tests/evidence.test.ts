import { describe, expect, it } from 'vitest';
import {
  defaultEvidenceQuery,
  evidenceQueryToParams,
  filterEvidence,
  hasActiveFilters,
  parseEvidenceQuery,
  type EvidenceQuery,
  type EvidenceRow,
} from '@/lib/client/evidence';

const rows: EvidenceRow[] = [
  { id: 'r1', source: 'reddit', title: 'Late delivery again', body: 'Third time the box arrived late.', url: '', author: 'u/a', date: '2025-11-10T00:00:00Z', score: 12, bucket: 1, sentiment: 'negative', relevance: 9 },
  { id: 'r2', source: 'reddit', title: 'Love the app', body: 'Great app overall.', url: '', author: 'u/b', date: '2025-11-11T00:00:00Z', score: 30, bucket: 2, sentiment: 'positive', relevance: 8 },
  { id: 'r3', source: 'hn', title: 'Late payments', body: 'Payments were late for me too.', url: '', author: 'hn1', date: '2025-11-09T00:00:00Z', score: 5, bucket: 1, sentiment: 'negative', relevance: 7 },
  { id: 'r4', source: 'google', title: 'Pricing question', body: 'Is the price worth it?', url: '', author: 'g1', date: 'not-a-date', score: 40, bucket: 3, sentiment: 'neutral', relevance: 8 },
  { id: 'r5', source: 'hn', title: 'Feature idea', body: 'Please add export.', url: '', author: 'hn2', date: '2025-11-08T00:00:00Z', score: 7, bucket: 2, sentiment: 'neutral', relevance: 5 },
];

describe('filterEvidence', () => {
  it('returns all rows with no filters (in input order for relevant sort by relevance then score)', () => {
    const out = filterEvidence(rows, { ...defaultEvidenceQuery });
    expect(out.map((r) => r.id)).toEqual(['r1', 'r4', 'r2', 'r3', 'r5']);
  });

  it('combines values within a group with OR', () => {
    const out = filterEvidence(rows, { ...defaultEvidenceQuery, themes: ['1', '2'] });
    expect(out.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3', 'r5']);
  });

  it('combines groups with AND', () => {
    const out = filterEvidence(rows, { ...defaultEvidenceQuery, themes: ['1'], sources: ['reddit'] });
    expect(out.map((r) => r.id)).toEqual(['r1']);
  });

  it('filters by feeling and all query terms', () => {
    const out = filterEvidence(rows, { ...defaultEvidenceQuery, feelings: ['negative'], q: 'late' });
    expect(out.map((r) => r.id).sort()).toEqual(['r1', 'r3']);
  });

  it('query terms must all appear', () => {
    expect(filterEvidence(rows, { ...defaultEvidenceQuery, q: 'late export' })).toEqual([]);
    expect(filterEvidence(rows, { ...defaultEvidenceQuery, q: 'LATE box' }).map((r) => r.id)).toEqual(['r1']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterEvidence(rows, { ...defaultEvidenceQuery, q: 'zebra' })).toEqual([]);
  });

  it('sorts newest with invalid dates last', () => {
    const out = filterEvidence(rows, { ...defaultEvidenceQuery, sort: 'newest' });
    expect(out.map((r) => r.id)).toEqual(['r2', 'r1', 'r3', 'r5', 'r4']);
  });

  it('sorts score descending, stably', () => {
    const out = filterEvidence(rows, { ...defaultEvidenceQuery, sort: 'score' });
    expect(out.map((r) => r.id)).toEqual(['r4', 'r2', 'r1', 'r5', 'r3']);
  });

  it('sorts relevant by relevance then score, stably', () => {
    const tied = [...rows, { ...rows[1], id: 'r2b', relevance: 8, score: 100 }];
    const out = filterEvidence(tied, { ...defaultEvidenceQuery });
    expect(out.map((r) => r.id)).toEqual(['r1', 'r2b', 'r4', 'r2', 'r3', 'r5']);
  });
});

describe('URL round-trip', () => {
  it('parses a full query string', () => {
    const sp = new URLSearchParams('tab=evidence&theme=1,2&source=reddit&feeling=negative&q=late&sort=newest');
    expect(parseEvidenceQuery(sp)).toEqual({
      q: 'late', themes: ['1', '2'], sources: ['reddit'], feelings: ['negative'], sort: 'newest',
    });
  });

  it('omits defaults from the URL', () => {
    const sp = evidenceQueryToParams(defaultEvidenceQuery);
    expect(sp.toString()).toBe('');
  });

  it('round-trips a non-default query', () => {
    const q: EvidenceQuery = { q: 'late', themes: ['1', '3'], sources: ['hn'], feelings: ['negative', 'neutral'], sort: 'score' };
    const sp = evidenceQueryToParams(q);
    expect(parseEvidenceQuery(sp)).toEqual(q);
    expect(sp.toString()).toBe('q=late&theme=1%2C3&source=hn&feeling=negative%2Cneutral&sort=score');
  });

  it('ignores unknown feeling and sort values', () => {
    const sp = new URLSearchParams('feeling=sad&sort=weird');
    const q = parseEvidenceQuery(sp);
    expect(q.feelings).toEqual([]);
    expect(q.sort).toBe('relevant');
  });

  it('hasActiveFilters', () => {
    expect(hasActiveFilters(defaultEvidenceQuery)).toBe(false);
    expect(hasActiveFilters({ ...defaultEvidenceQuery, q: 'x' })).toBe(true);
  });
});
