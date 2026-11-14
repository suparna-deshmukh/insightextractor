import { copy } from '@/lib/copy';
import type { SourceId } from '@/lib/client/types';
import { SOURCE_ORDER } from '@/lib/client/signals';

export const SOURCE_LABELS: Record<SourceId, string> = {
  reddit: copy.sources.items.reddit.label,
  google: copy.sources.items.google.label,
  hn: copy.sources.items.hn.label,
  github: copy.sources.items.github.label,
  producthunt: copy.sources.items.producthunt.label,
  appstore: copy.sources.items.appstore.label,
  play: copy.sources.items.play.label,
  youtube: copy.sources.items.youtube.label,
};

export const sourceLabels = (ids: readonly SourceId[]): string[] =>
  SOURCE_ORDER.filter((id) => ids.includes(id)).map((id) => SOURCE_LABELS[id]);
