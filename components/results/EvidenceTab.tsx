'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { copy } from '@/lib/copy';
import {
  defaultEvidenceQuery,
  evidenceQueryToParams,
  filterEvidence,
  hasActiveFilters,
  parseEvidenceQuery,
  type EvidenceQuery,
  type EvidenceRow,
} from '@/lib/client/evidence';
import type { StoredRun } from '@/lib/client/types';
import { EvidenceCards } from './EvidenceCards';
import { EvidenceFilters, type FilterOption } from './EvidenceFilters';
import { EvidenceTable } from './EvidenceTable';
import styles from './evidence.module.css';

const PAGE = 50;

export function EvidenceTab({ run }: { run: StoredRun }) {
  const router = useRouter();
  const sp = useSearchParams();
  const result = run.result;
  const rows = useMemo<EvidenceRow[]>(() => result.labeled, [result.labeled]);
  const query = useMemo(() => parseEvidenceQuery(sp), [sp]);
  const [qInput, setQInput] = useState(query.q);
  const [visible, setVisible] = useState(PAGE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debounce = useRef<number | null>(null);

  const patch = (p: Partial<EvidenceQuery>) => {
    const next: EvidenceQuery = { ...query, ...p };
    if ('q' in p) setQInput(p.q ?? '');
    const params = new URLSearchParams(sp.toString());
    params.set('tab', 'evidence');
    const ev = evidenceQueryToParams(next);
    for (const k of ['q', 'theme', 'source', 'feeling', 'sort']) params.delete(k);
    for (const [k, v] of ev.entries()) params.set(k, v);
    setVisible(PAGE);
    setExpandedId(null);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      if (qInput !== query.q) patch({ q: qInput });
    }, 200);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  useEffect(() => {
    setQInput(query.q);
    setVisible(PAGE);
    setExpandedId(null);
  }, [query]);

  const filtered = useMemo(() => filterEvidence(rows, query), [rows, query]);
  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;
  const active = hasActiveFilters(query);

  const bucketName = (id: number) => result.buckets.find((b) => b.bucket.id === id)?.bucket.name ?? `#${id}`;

  const themeOptions: FilterOption[] = result.buckets
    .map((b) => ({ id: String(b.bucket.id), label: b.bucket.name, count: b.count }))
    .sort((a, b) => b.count - a.count);
  const sourceOptions: FilterOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
    return Array.from(counts.entries()).map(([id, count]) => ({
      id,
      label: copy.sources.items[id as keyof typeof copy.sources.items].label,
      count,
    }));
  }, [rows]);
  const feelingOptions: FilterOption[] = (['positive', 'negative', 'neutral'] as const).map((f) => ({
    id: f,
    label: copy.results.feelings[f],
    count: rows.filter((r) => r.sentiment === f).length,
  }));

  const terms = useMemo(
    () => Array.from(new Set([...query.q.split(/\s+/).filter(Boolean), ...result.plan.keywords])),
    [query.q, result.plan.keywords],
  );

  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...query.themes.map((t) => ({
      key: `theme-${t}`,
      label: bucketName(Number(t)),
      onRemove: () => patch({ themes: query.themes.filter((v) => v !== t) }),
    })),
    ...query.sources.map((s) => ({
      key: `source-${s}`,
      label: copy.sources.items[s as keyof typeof copy.sources.items]?.label ?? s,
      onRemove: () => patch({ sources: query.sources.filter((v) => v !== s) }),
    })),
    ...query.feelings.map((f) => ({
      key: `feeling-${f}`,
      label: copy.results.feelings[f],
      onRemove: () => patch({ feelings: query.feelings.filter((v) => v !== f) }),
    })),
    ...(query.q
      ? [{ key: 'q', label: query.q, onRemove: () => patch({ q: '' }) }]
      : []),
  ];

  return (
    <div className={styles.evidence}>
      <div className={styles.toolbar}>
        <div className={styles.searchRow}>
          <div className={styles.searchField}>
            <Search size={16} aria-hidden="true" className={styles.searchIcon} />
            <input
              type="search"
              className={styles.searchInput}
              placeholder={copy.evidence.search}
              aria-label={copy.evidence.search}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
        </div>
        <EvidenceFilters
          query={query}
          onPatch={patch}
          themes={themeOptions}
          sources={sourceOptions}
          feelings={feelingOptions}
        />
        {chips.length > 0 && (
          <div className={styles.chipsRow}>
            {chips.map((c) => (
              <Chip key={c.key} onRemove={c.onRemove}>
                {c.label}
              </Chip>
            ))}
            <button type="button" className={styles.textBtn} onClick={() => patch({ ...defaultEvidenceQuery })}>
              {copy.evidence.clear}
            </button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX size={22} aria-hidden="true" />}
          title={copy.evidence.empty}
          action={
            <Button variant="secondary" onClick={() => patch({ ...defaultEvidenceQuery })}>
              {copy.evidence.clear}
            </Button>
          }
        />
      ) : (
        <>
          <p className={styles.countLine}>
            {copy.evidence.showing(1, Math.min(visible, filtered.length), filtered.length)}
            {active && <span className={styles.countTotal}> of {rows.length}</span>}
          </p>
          {shown.length > 0 && (
            <>
              <EvidenceTable
                rows={shown}
                terms={terms}
                bucketName={bucketName}
                expandedId={expandedId}
                onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
              />
              <EvidenceCards
                rows={shown}
                terms={terms}
                bucketName={bucketName}
                expandedId={expandedId}
                onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
              />
            </>
          )}
          {remaining > 0 && (
            <div className={styles.moreRow}>
              <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)}>
                {copy.evidence.more(Math.min(PAGE, remaining))}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
