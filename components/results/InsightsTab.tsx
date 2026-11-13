'use client';
import { useMemo } from 'react';
import { copy } from '@/lib/copy';
import { toSentenceCase, type ReportSection } from '@/lib/client/report';
import type { StoredRun } from '@/lib/client/types';
import { Prose } from './Prose';
import { RailNav } from './RailNav';
import { Section } from './Section';
import { ThemeList } from './ThemeList';
import { TrendChart } from './TrendChart';
import styles from './insights.module.css';

type Built = { id: string; heading: string; body: React.ReactNode };

export function InsightsTab({
  run,
  sections,
  fresh,
  onSeeAll,
}: {
  run: StoredRun;
  sections: ReportSection[];
  fresh: boolean;
  onSeeAll: (bucketId: number) => void;
}) {
  const result = run.result;
  const keywords = result.plan.keywords;

  const ordered = useMemo<Built[]>(() => {
    const byKey = new Map<string, ReportSection>();
    for (const s of sections) if (!byKey.has(s.key)) byKey.set(s.key, s);
    const out: Built[] = [];

    const snap = byKey.get('snapshot');
    if (snap?.md) {
      out.push({ id: 'short', heading: copy.results.sections.snapshot, body: <Prose md={snap.md} keywords={keywords} lead swipe={fresh} /> });
    }

    const themesBody =
      result.buckets.length > 0 ? (
        <ThemeList buckets={result.buckets} fresh={fresh} onSeeAll={onSeeAll} keywords={keywords} />
      ) : byKey.get('themes')?.md ? (
        <Prose md={byKey.get('themes')!.md} keywords={keywords} />
      ) : null;
    if (themesBody) out.push({ id: 'themes', heading: copy.results.sections.themes, body: themesBody });

    const proseSection = (key: string, id: string, heading: string) => {
      const sec = byKey.get(key);
      if (sec?.md) out.push({ id, heading, body: <Prose md={sec.md} keywords={keywords} /> });
    };
    proseSection('love', 'love', copy.results.sections.love);
    proseSection('hate', 'hate', copy.results.sections.hate);
    proseSection('needs', 'needs', copy.results.sections.needs);
    proseSection('voices', 'voices', copy.results.sections.voices);

    const trendsSec = byKey.get('trends');
    const hasTrend = result.trend.length >= 5;
    if (hasTrend || trendsSec?.md) {
      out.push({
        id: 'trends',
        heading: copy.results.sections.trends,
        body: (
          <>
            {hasTrend && <TrendChart trend={result.trend} />}
            {trendsSec?.md && <Prose md={trendsSec.md} keywords={keywords} />}
          </>
        ),
      });
    }

    const comp = byKey.get('competitors');
    if (comp?.md) out.push({ id: 'competitors', heading: copy.results.sections.competitors, body: <Prose md={comp.md} keywords={keywords} /> });
    for (const h of sections.filter((s) => s.key === 'hypotheses')) {
      out.push({ id: 'hypotheses', heading: copy.results.sections.hypotheses, body: <Prose md={h.md} keywords={keywords} /> });
    }
    let otherIdx = 0;
    for (const s of sections.filter((s) => s.key === 'other' && s.md)) {
      out.push({ id: `other-${otherIdx++}`, heading: toSentenceCase(s.heading), body: <Prose md={s.md} keywords={keywords} /> });
    }

    const recs = byKey.get('recs');
    if (recs?.md) out.push({ id: 'next', heading: copy.results.sections.recs, body: <Prose md={recs.md} keywords={keywords} /> });
    return out;
  }, [sections, result, fresh, onSeeAll, keywords]);

  return (
    <div className="results-layout">
      <div className={styles.mainCol}>
        {ordered.map((sec, i) => (
          <Section key={sec.id} id={sec.id} heading={sec.heading} first={i === 0}>
            {sec.body}
          </Section>
        ))}
      </div>
      <RailNav items={ordered.map((s) => ({ id: s.id, label: s.heading }))} />
    </div>
  );
}
