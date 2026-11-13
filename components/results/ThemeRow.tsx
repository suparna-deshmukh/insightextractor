import { Circle, CircleAlert, Frown, Lightbulb, Meh, Smile, ThumbsUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Disclosure } from '@/components/ui/Disclosure';
import { copy } from '@/lib/copy';
import { kindLabel, kindOf, relDate, sentimentLabel, sentimentText } from '@/lib/client/insights';
import type { BucketStats } from '@/lib/types';
import { QuoteCard } from './QuoteCard';
import styles from './insights.module.css';

const KIND_META = {
  pain: { icon: CircleAlert, tone: 'negative' as const },
  praise: { icon: ThumbsUp, tone: 'positive' as const },
  'feature-request': { icon: Lightbulb, tone: 'request' as const },
  other: { icon: Circle, tone: 'neutral' as const },
};
const FEEL_ICON = { negative: Frown, positive: Smile, mixed: Meh };

export function ThemeRow({
  stats,
  index,
  open,
  onToggle,
  fresh,
  onSeeAll,
  keywords,
}: {
  stats: BucketStats;
  index: number;
  open: boolean;
  onToggle: () => void;
  fresh: boolean;
  onSeeAll: (bucketId: number) => void;
  keywords: string[];
}) {
  const b = stats.bucket;
  const kind = kindOf(b.kind);
  const kindMeta = KIND_META[kind];
  const FeelIcon = FEEL_ICON[sentimentLabel(stats).key];
  const bySource = stats.bySource
    .map((s) => `${copy.sources.items[s.source].label} ${s.count}`)
    .join(', ');

  return (
    <article className={styles.themeRow}>
      <div className={styles.themeHead}>
        <h3 className={styles.themeName}>{b.name}</h3>
        <Badge tone={kindMeta.tone} icon={<kindMeta.icon size={13} aria-hidden="true" />}>
          {kindLabel(b.kind)}
        </Badge>
      </div>
      <div
        className={styles.barTrack}
        role="img"
        aria-label={`${copy.results.shareOfPosts(stats.share)} — ${b.name}`}
      >
        <div
          data-testid="bar-fill"
          className={fresh ? `${styles.barFill} ${styles.barAnim}` : styles.barFill}
          style={{ width: `${stats.share}%`, animationDelay: `${index * 60}ms` }}
        />
      </div>
      <div className={styles.statsRow}>
        <span>
          {copy.results.shareOfPosts(stats.share)}, {copy.results.postsCount(stats.count)}
        </span>
        <span className={styles.feeling}>
          <FeelIcon size={15} aria-hidden="true" /> {sentimentText(stats)}
        </span>
      </div>
      {bySource && <p className={styles.bySource}>{bySource}</p>}
      {b.description && <p className={styles.desc}>{b.description}</p>}
      {stats.topQuotes.length > 0 && (
        <Disclosure title={open ? copy.results.hideExamples : copy.results.seeExamples} open={open} onOpenChange={onToggle}>
          <div className={styles.examples}>
            {stats.topQuotes.slice(0, 2).map((q) => (
              <QuoteCard key={q.id} record={q} keywords={keywords} />
            ))}
            <button type="button" className={styles.textBtn} onClick={() => onSeeAll(b.id)}>
              {copy.results.seeAllPosts(stats.count)}
            </button>
          </div>
        </Disclosure>
      )}
    </article>
  );
}
