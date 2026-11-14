'use client';
import { ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Popover } from '@/components/ui/Popover';
import { copy } from '@/lib/copy';
import type { EvidenceQuery } from '@/lib/client/evidence';
import styles from './evidence.module.css';

export type FilterOption = { id: string; label: string; count: number };

function FilterButton({
  label,
  active,
  children,
}: {
  label: string;
  active: number;
  children: React.ReactNode;
}) {
  return (
    <Popover
      width={320}
      trigger={
        <Button variant="secondary" size="sm" className={active ? styles.filterActive : undefined}>
          {label}
          {active > 0 && <span className={styles.filterCount}>{active}</span>}
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      }
    >
      {children}
    </Popover>
  );
}

function CheckRow({
  option,
  checked,
  onToggle,
}: {
  option: FilterOption;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={onToggle}
      label={
        <span className={styles.optRow}>
          {option.label}
          <span className={styles.optCount}>{option.count}</span>
        </span>
      }
    />
  );
}

export function EvidenceFilters({
  query,
  onPatch,
  themes,
  sources,
  feelings,
}: {
  query: EvidenceQuery;
  onPatch: (patch: Partial<EvidenceQuery>) => void;
  themes: FilterOption[];
  sources: FilterOption[];
  feelings: FilterOption[];
}) {
  const toggleIn = (key: 'themes' | 'sources', id: string) => {
    const cur = query[key];
    onPatch({ [key]: cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id] } as Partial<EvidenceQuery>);
  };
  const toggleFeeling = (id: 'positive' | 'negative' | 'neutral') => {
    const cur = query.feelings;
    onPatch({ feelings: cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id] });
  };
  const sorts: { id: EvidenceQuery['sort']; label: string }[] = [
    { id: 'relevant', label: copy.evidence.sorts.relevant },
    { id: 'newest', label: copy.evidence.sorts.newest },
    { id: 'score', label: copy.evidence.sorts.score },
  ];

  return (
    <div className={styles.filterRow}>
      <FilterButton label={copy.evidence.theme} active={query.themes.length}>
        <div className={styles.optList}>
          <Checkbox checked={query.themes.length === 0} onCheckedChange={() => onPatch({ themes: [] })} label={copy.evidence.allThemes} />
          {themes.map((o) => (
            <CheckRow key={o.id} option={o} checked={query.themes.includes(o.id)} onToggle={() => toggleIn('themes', o.id)} />
          ))}
        </div>
      </FilterButton>
      <FilterButton label={copy.evidence.source} active={query.sources.length}>
        <div className={styles.optList}>
          <Checkbox checked={query.sources.length === 0} onCheckedChange={() => onPatch({ sources: [] })} label={copy.evidence.allSources} />
          {sources.map((o) => (
            <CheckRow key={o.id} option={o} checked={query.sources.includes(o.id)} onToggle={() => toggleIn('sources', o.id)} />
          ))}
        </div>
      </FilterButton>
      <FilterButton label={copy.evidence.feeling} active={query.feelings.length}>
        <div className={styles.optList}>
          {feelings.map((o) => (
            <CheckRow
              key={o.id}
              option={o}
              checked={query.feelings.includes(o.id as 'positive' | 'negative' | 'neutral')}
              onToggle={() => toggleFeeling(o.id as 'positive' | 'negative' | 'neutral')}
            />
          ))}
        </div>
      </FilterButton>
      <span className={styles.sortLabel}>{copy.evidence.sort}</span>
      <Popover
        width={220}
        align="start"
        trigger={
          <Button variant="secondary" size="sm">
            {copy.evidence.sorts[query.sort]}
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        }
      >
        <div className={styles.optList}>
          {sorts.map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.sortOpt}
              aria-pressed={query.sort === s.id}
              onClick={() => onPatch({ sort: s.id })}
            >
              <span className={styles.sortOptLabel}>{s.label}</span>
              {query.sort === s.id && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}
