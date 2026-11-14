import { copy } from '@/lib/copy';
import { timeAgo } from '@/lib/client/time';
import type { SourceId, TimeFrame } from '@/lib/types';

export function sentimentLabel(b: { positive: number; negative: number; neutral: number }) {
  const total = b.positive + b.negative + b.neutral;
  if (!total) return { key: 'mixed' as const, pct: 0 };
  const p = b.positive / total;
  const n = b.negative / total;
  if (n >= 0.6) return { key: 'negative' as const, pct: Math.round(n * 100) };
  if (p >= 0.6) return { key: 'positive' as const, pct: Math.round(p * 100) };
  return { key: 'mixed' as const, pct: Math.round(Math.max(p, n) * 100) };
}

export function sentimentText(b: { positive: number; negative: number; neutral: number }): string {
  const { key, pct } = sentimentLabel(b);
  if (key === 'negative') return `${copy.results.mostlyNegative} (${pct}%)`;
  if (key === 'positive') return `${copy.results.mostlyPositive} (${pct}%)`;
  return copy.results.mixed;
}

export function trimQuote(text: string, max = 260): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

const dayMonth = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));

export function timeWords(tf: TimeFrame): string {
  switch (tf.preset) {
    case '7d':
      return 'the past week';
    case '30d':
      return 'the past month';
    case '90d':
      return 'the past 3 months';
    case '1y':
      return 'the past year';
    case 'all':
      return 'all time';
    case 'custom': {
      const a = tf.start ? dayMonth(tf.start) : '';
      const b = tf.end ? dayMonth(tf.end) : '';
      return [a, b].filter(Boolean).join(' to ');
    }
  }
}

export function sourceList(ids: SourceId[]): string {
  return copy.sources.summary(ids.map((id) => copy.sources.items[id].label));
}

export function kindOf(kind: string): 'pain' | 'praise' | 'feature-request' | 'other' {
  if (kind === 'pain' || kind === 'praise' || kind === 'feature-request') return kind;
  return 'other';
}

export function kindLabel(kind: string): string {
  const k = kindOf(kind);
  return k === 'other' ? kind.replace(/-/g, ' ') : copy.results.kinds[k];
}

export function firstSentenceIfNoisy(w: string): string {
  if (/https?:\/\//i.test(w) || /at .+:\d+/.test(w)) {
    const i = w.indexOf('. ');
    return i > 0 ? w.slice(0, i + 1) : w;
  }
  return w;
}

export function relDate(date: string): string {
  const t = Date.parse(date);
  return Number.isNaN(t) ? date : timeAgo(t);
}
