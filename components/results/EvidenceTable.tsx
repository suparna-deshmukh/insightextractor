import { SourceIcon } from '@/components/ui/SourceIcon';
import { Tooltip } from '@/components/ui/Tooltip';
import { Highlight } from '@/components/ui/Highlight';
import { Feeling } from './Feeling';
import { copy } from '@/lib/copy';
import { relDate } from '@/lib/client/insights';
import type { EvidenceRow } from '@/lib/client/evidence';
import styles from './evidence.module.css';

const FULL_MAX = 1200;

function expandedText(r: EvidenceRow): string {
  const full = r.title ? `${r.title} ${r.body}` : r.body;
  return full.length > FULL_MAX ? full.slice(0, FULL_MAX) : full;
}

function CellText({ r, terms, expanded }: { r: EvidenceRow; terms: string[]; expanded: boolean }) {
  return (
    <div className={styles.cellText}>
      {r.title && <p className={styles.cellTitle}>{r.title}</p>}
      <p className={expanded ? styles.cellExpanded : styles.cellClamp}>
        <Highlight text={expanded ? expandedText(r) : r.body} terms={terms} />
      </p>
    </div>
  );
}

export function EvidenceTable({
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
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{copy.evidence.columns.source}</th>
            <th>{copy.evidence.columns.theme}</th>
            <th>{copy.evidence.columns.feeling}</th>
            <th>{copy.evidence.columns.text}</th>
            <th className={styles.thReactions}>
              <Tooltip label={copy.evidence.reactionsHint}>
                <span className={styles.thInner}>{copy.evidence.columns.reactions}</span>
              </Tooltip>
            </th>
            <th>{copy.evidence.columns.date}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <tr key={r.id} className={expanded ? styles.rowExpanded : undefined}>
                <td>
                  <span className={styles.srcCell}>
                    <SourceIcon id={r.source} size={22} />
                    {copy.sources.items[r.source].label}
                  </span>
                </td>
                <td className={styles.themeCell}>{bucketName(r.bucket)}</td>
                <td>
                  <Feeling sentiment={r.sentiment} />
                </td>
                <td>
                  <CellText r={r} terms={terms} expanded={expanded} />
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
                </td>
                <td className={styles.reactions}>{r.score}</td>
                <td title={new Date(r.date).toDateString()}>{relDate(r.date)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
