export type SectionKey =
  | 'snapshot'
  | 'themes'
  | 'love'
  | 'hate'
  | 'needs'
  | 'voices'
  | 'trends'
  | 'recs'
  | 'method'
  | 'dataNote'
  | 'competitors'
  | 'hypotheses'
  | 'other';

export type ReportSection = { key: SectionKey; heading: string; md: string };

const KEYS: Record<string, SectionKey> = {
  SNAPSHOT: 'snapshot',
  'TOP INSIGHT BUCKETS': 'themes',
  'WHAT USERS LOVE': 'love',
  'WHAT USERS HATE': 'hate',
  'UNMET NEEDS & FEATURE REQUESTS': 'needs',
  'VOICE OF THE USER': 'voices',
  'MOMENTUM & TRENDS': 'trends',
  RECOMMENDATIONS: 'recs',
  'METHOD & DATA APPENDIX': 'method',
  'DATA NOTE': 'dataNote',
  'COMPETITOR COMPARISON': 'competitors',
};

export function parseReport(md: string): ReportSection[] {
  const out: ReportSection[] = [];
  let cur: ReportSection | null = null;
  for (const line of md.split('\n')) {
    const m = /^##\s+(?:\d+\.\s*)?(.+?)\s*$/.exec(line);
    if (m) {
      const norm = m[1].toUpperCase().replace(/\s+/g, ' ').trim();
      const key = KEYS[norm] ?? (/HYPOTHES/.test(norm) ? 'hypotheses' : 'other');
      cur = { key, heading: m[1], md: '' };
      out.push(cur);
    } else if (cur) {
      cur.md += line + '\n';
    } // text before the first "##" (the H1 title) is dropped on purpose
  }
  return out.map((s) => ({ ...s, md: s.md.trim() }));
}

export const toSentenceCase = (s: string): string => {
  const l = s.toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
};
