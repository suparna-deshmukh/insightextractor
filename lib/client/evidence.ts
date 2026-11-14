import type { EvidenceRecord, SourceId } from '@/lib/types';

export type EvidenceRow = EvidenceRecord & {
  bucket: number;
  sentiment: string;
  relevance?: number;
};

export type EvidenceQuery = {
  q: string;
  themes: string[];
  sources: string[];
  feelings: Array<'positive' | 'negative' | 'neutral'>;
  sort: 'relevant' | 'newest' | 'score';
};

export const defaultEvidenceQuery: EvidenceQuery = {
  q: '',
  themes: [],
  sources: [],
  feelings: [],
  sort: 'relevant',
};

export function filterEvidence(rows: EvidenceRow[], query: EvidenceQuery): EvidenceRow[] {
  const terms = query.q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = rows.filter((r) => {
    if (query.themes.length && !query.themes.includes(String(r.bucket))) return false;
    if (query.sources.length && !query.sources.includes(r.source)) return false;
    if (query.feelings.length && !query.feelings.includes(r.sentiment as 'positive' | 'negative' | 'neutral')) return false;
    if (terms.length) {
      const hay = (r.title + ' ' + r.body).toLowerCase();
      for (const t of terms) if (!hay.includes(t)) return false;
    }
    return true;
  });
  return out.sort((a, b) => {
    if (query.sort === 'newest') {
      const da = Date.parse(a.date);
      const db = Date.parse(b.date);
      const ia = Number.isNaN(da) ? 1 : 0;
      const ib = Number.isNaN(db) ? 1 : 0;
      if (ia !== ib) return ia - ib; // invalid dates last, stable
      if (ia === 1) return 0;
      return db - da;
    }
    if (query.sort === 'score') return b.score - a.score;
    const rel = (b.relevance ?? 0) - (a.relevance ?? 0);
    if (rel !== 0) return rel;
    return b.score - a.score;
  });
}

export function parseEvidenceQuery(sp: URLSearchParams): EvidenceQuery {
  const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
  const feeling = (f: string): f is 'positive' | 'negative' | 'neutral' =>
    f === 'positive' || f === 'negative' || f === 'neutral';
  const sort = sp.get('sort');
  return {
    q: sp.get('q') ?? '',
    themes: list(sp.get('theme')),
    sources: list(sp.get('source')),
    feelings: list(sp.get('feeling')).filter(feeling),
    sort: sort === 'newest' || sort === 'score' ? sort : 'relevant',
  };
}

export function evidenceQueryToParams(query: EvidenceQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (query.q) sp.set('q', query.q);
  if (query.themes.length) sp.set('theme', query.themes.join(','));
  if (query.sources.length) sp.set('source', query.sources.join(','));
  if (query.feelings.length) sp.set('feeling', query.feelings.join(','));
  if (query.sort !== 'relevant') sp.set('sort', query.sort);
  return sp;
}

export function hasActiveFilters(query: EvidenceQuery): boolean {
  return Boolean(
    query.q || query.themes.length || query.sources.length || query.feelings.length,
  );
}

export type SourceCount = { id: SourceId; count: number };
