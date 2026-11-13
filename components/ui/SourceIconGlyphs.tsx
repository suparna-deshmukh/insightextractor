'use client';

import type { SourceId } from '@/lib/types';
import {
  SiReddit, SiGoogle, SiYcombinator, SiGithub, SiProducthunt, SiAppstore, SiGoogleplay, SiYoutube,
} from '@icons-pack/react-simple-icons';
import { MessagesSquare, Search, Newspaper, Code, Rocket, Smartphone, Play } from 'lucide-react';

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

// PLAN-NOTE: brand and fallback glyphs live in a lazily imported chunk so the
// simple-icons weight stays out of the first-load path (phase 7.5 size budget).
export default function Glyph({ id, size }: { id: string; size: number }) {
  const known = (Object.keys(SIMPLE) as SourceId[]).includes(id as SourceId);
  const Icon = known ? SIMPLE[id as SourceId] : FALLBACK[id as SourceId] ?? Newspaper;
  return <Icon size={size} />;
}
