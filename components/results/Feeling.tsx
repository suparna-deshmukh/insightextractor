import { Frown, Meh, Smile } from 'lucide-react';
import { copy } from '@/lib/copy';
import styles from './evidence.module.css';

const ICONS = { positive: Smile, negative: Frown, neutral: Meh };

export function Feeling({ sentiment }: { sentiment: string }) {
  const key = (['positive', 'negative', 'neutral'].includes(sentiment) ? sentiment : 'neutral') as
    | 'positive'
    | 'negative'
    | 'neutral';
  const Icon = ICONS[key];
  return (
    <span className={styles.feelingCell}>
      <Icon size={15} aria-hidden="true" />
      {copy.results.feelings[key]}
    </span>
  );
}
