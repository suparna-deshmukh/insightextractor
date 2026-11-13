import { Badge } from '@/components/ui/Badge';
import { Highlight } from '@/components/ui/Highlight';
import { Feeling } from './Feeling';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { copy } from '@/lib/copy';
import { relDate } from '@/lib/client/insights';
import type { EvidenceRow } from '@/lib/client/evidence';
import styles from './evidence.module.css';

const FULL_MAX = 1200;

function cardText(r: EvidenceRow, expanded: boolean): string {
  const full = r.title ? `${r.title} ${r.body}` : r.body;
  if (expanded) return full.length > FULL_MAX ? full.slice(0, FULL_MAX) : full;
  return r.title ? r.title : r.body;
}

export function EvidenceCards({
  rows,
  terms,
  bucketName,
  expandedId,
  onToggle,
}: {
  rows: EvidenceRow[];
  terms: string[];
  bucketName: (id: number) => string;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div className={styles.cards}>
      {rows.map((r) => {
        const expanded = expandedId === r.id;
        return (
          <article key={r.id} className={styles.card}>
            <div className={styles.cardTop}>
              <SourceIcon id={r.source} size={22} />
              <span>{copy.sources.items[r.source].label}</span>
              <span className={styles.cardDate} title={new Date(r.date).toDateString()}>
                {relDate(r.date)}
              </span>
            </div>
            <p className={expanded ? styles.cardExpanded : styles.cardText}>
              <Highlight text={cardText(r, expanded)} terms={terms} />
            </p>
            <div className={styles.cardMeta}>
              <Badge tone="neutral">{bucketName(r.bucket)}</Badge>
                  <Feeling sentiment={r.sentiment} />
              <span className={styles.cardReactions}>
                {copy.evidence.reactionsCount(r.score)}
              </span>
            </div>
            <div className={styles.rowActions}>
              <button type="button" className={styles.textBtn} onClick={() => onToggle(r.id)}>
                {expanded ? copy.evidence.showLess : copy.evidence.readMore}
              </button>
              {expanded && r.url && (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {copy.results.openOriginal}
                </a>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
