import type { SourceId } from '@/lib/types';
import {
  SiReddit, SiGoogle, SiYcombinator, SiGithub, SiProducthunt, SiAppstore, SiGoogleplay, SiYoutube,
} from '@icons-pack/react-simple-icons';
import { MessagesSquare, Search, Newspaper, Code, Rocket, Smartphone, Play } from 'lucide-react';
import styles from './SourceIcon.module.css';

type IconComp = React.ComponentType<{ size?: number | string; className?: string; }>;

const SIMPLE: Record<SourceId, IconComp> = {
  reddit: SiReddit as IconComp,
  google: SiGoogle as IconComp,
  hn: SiYcombinator as IconComp,
  github: SiGithub as IconComp,
  producthunt: SiProducthunt as IconComp,
  appstore: SiAppstore as IconComp,
  play: SiGoogleplay as IconComp,
  youtube: SiYoutube as IconComp,
};

const FALLBACK: Record<SourceId, IconComp> = {
  reddit: MessagesSquare,
  google: Search,
  hn: Newspaper,
  github: Code,
  producthunt: Rocket,
  appstore: Smartphone,
  play: Smartphone,
  youtube: Play,
};

export function SourceIcon({ id, size = 36 }: { id: string; size?: number }) {
  const known = (Object.keys(SIMPLE) as SourceId[]).includes(id as SourceId);
  const Icon = known ? SIMPLE[id as SourceId] : FALLBACK[id as SourceId] ?? Newspaper;
  return (
    <span className={styles.tile} style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.55)} />
    </span>
  );
}
