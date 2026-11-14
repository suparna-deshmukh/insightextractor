import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BucketStats, EvidenceRecord, RunResult, StoredRun } from '@/lib/client/types';

vi.mock('next/navigation', () => {
  const sp = new URLSearchParams('');
  return {
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => sp,
  };
});

import { ThemeRow } from '@/components/results/ThemeRow';
import { TrendChart } from '@/components/results/TrendChart';
import { EvidenceTab } from '@/components/results/EvidenceTab';
import { TooltipProvider } from '@/components/ui/Tooltip';

function stats(share: number, count = 228): BucketStats {
  return {
    bucket: { id: 1, name: 'Delivery delays', description: 'Boxes arrive late.', kind: 'pain' },
    count,
    share,
    avgScore: 12,
    positive: 10,
    negative: 80,
    neutral: 8,
    bySource: [
      { source: 'reddit', count: 120 },
      { source: 'hn', count: 48 },
    ],
    topQuotes: [
      {
        id: 'q1',
        source: 'reddit',
        title: 'Late again',
        body: 'Third time this month my box arrived two days late.',
        url: 'https://reddit.com/p1',
        author: 'u/name',
        date: '2025-11-01T00:00:00Z',
        score: 124,
      },
    ],
  };
}

describe('ThemeRow', () => {
  it('fills exactly share% of the track (true scale)', () => {
    const { container } = render(
      <ThemeRow stats={stats(50)} index={0} open={false} onToggle={() => {}} fresh={false} onSeeAll={() => {}} keywords={[]} />,
    );
    const fill = container.querySelector<HTMLElement>('[data-testid="bar-fill"]');
    expect(fill?.style.width).toBe('50%');
  });

  it('fills 33% for a 33 share', () => {
    const { container } = render(
      <ThemeRow stats={stats(33, 100)} index={1} open={false} onToggle={() => {}} fresh={false} onSeeAll={() => {}} keywords={[]} />,
    );
    const fill = container.querySelector<HTMLElement>('[data-testid="bar-fill"]');
    expect(fill?.style.width).toBe('33%');
  });
});

describe('TrendChart', () => {
  const points = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2025, 9, 1 + i)).toISOString(), count: (i * 7) % 11 + 2 }));

  it('hides the chart with fewer than 5 points', () => {
    const { container } = render(<TrendChart trend={points(4)} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders an accessible chart with 5 or more points', () => {
    const { container } = render(<TrendChart trend={points(6)} />);
    const svg = container.querySelector<SVGSVGElement>('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toMatch(/busiest day/);
  });
});

function makeRun(n: number): StoredRun {
  const labeled: (EvidenceRecord & { bucket: number; sentiment: string })[] = Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    source: i % 2 === 0 ? 'reddit' : 'hn',
    title: `Post ${i}`,
    body: `Body ${i} about delivery delays`,
    url: '',
    author: `u/${i}`,
    date: new Date(Date.UTC(2025, 10, 14 - (i % 14))).toISOString(),
    score: (i * 13) % 500,
    bucket: (i % 3) + 1,
    sentiment: i % 3 === 0 ? 'negative' : i % 3 === 1 ? 'positive' : 'neutral',
  }));
  const buckets: BucketStats[] = [1, 2, 3].map((id) => ({
    ...stats(Math.round((n / 3) * 0.9), Math.round(n / 3)),
    bucket: { id, name: `Theme ${id}`, description: '', kind: 'pain' },
    topQuotes: [],
  }));
  const result: RunResult = {
    topic: 'Why do people stop using budgeting apps',
    description: '',
    objective: 'problem-discovery',
    timeframe: { preset: '30d' },
    plan: { keywords: ['delivery'], queries: {}, apps: [], subreddits: [], lookFor: [], hypotheses: [], problemStatement: '', objective: '' },
    totalRecords: n,
    keptRecords: n,
    irrelevantDropped: 0,
    perSource: [],
    buckets,
    trend: [],
    labeled,
    rawCsv: '',
    sqlAudit: [],
    report: '',
    model: 'x',
    usedLlm: true,
    durationMs: 0,
  };
  return { id: 'run1', ts: Date.now(), request: {} as StoredRun['request'], result };
}

describe('EvidenceTab paging', () => {
  it('shows 50 of 842 rows, then 100 after Show 50 more', () => {
    const { container } = render(<TooltipProvider><EvidenceTab run={makeRun(842)} /></TooltipProvider>);
    expect(screen.getByText('Showing 1 to 50 of 842')).toBeTruthy();
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(100);
    expect(screen.getByText('Showing 1 to 100 of 842')).toBeTruthy();
  });
});
