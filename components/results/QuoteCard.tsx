import { ExternalLink } from 'lucide-react';
import { Highlight } from '@/components/ui/Highlight';
import { copy } from '@/lib/copy';
import { relDate, trimQuote } from '@/lib/client/insights';
import type { EvidenceRecord } from '@/lib/types';
import styles from './insights.module.css';

export function QuoteCard({ record, keywords }: { record: EvidenceRecord; keywords: string[] }) {
  const text = trimQuote(record.title ? `${record.title} ${record.body}` : record.body);
  const attribution = [
    copy.sources.items[record.source].label,
    record.author,
    relDate(record.date),
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <figure className={styles.quoteCard}>
      <blockquote>
        <Highlight text={text} terms={keywords} />
      </blockquote>
      <figcaption>
        {attribution}
        {record.url && (
          <>
            {' '}
            <a href={record.url} target="_blank" rel="noopener noreferrer" className={styles.quoteLink}>
              {copy.results.openOriginal} <ExternalLink size={12} aria-hidden="true" />
            </a>
          </>
        )}
      </figcaption>
    </figure>
  );
}
