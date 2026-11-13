'use client';
import { useState } from 'react';
import { copy } from '@/lib/copy';
import styles from './insights.module.css';

const W = 600;
const H = 160;
const PAD_L = 10;
const PAD_R = 10;
const PAD_T = 24;
const PAD_B = 22;

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
};

export function TrendChart({ trend }: { trend: { date: string; count: number }[] }) {
  const [focus, setFocus] = useState<number | null>(null);
  if (trend.length < 5) return null;
  const n = trend.length;
  const max = Math.max(...trend.map((t) => t.count), 1);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (i * innerW) / (n - 1);
  const y = (c: number) => PAD_T + (1 - c / max) * innerH;
  const peakIdx = trend.reduce((best, t, i) => (t.count > trend[best].count ? i : best), 0);
  const peak = trend[peakIdx];
  const mid = Math.floor((n - 1) / 2);
  const line = trend.map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(t.count).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(n - 1).toFixed(1)} ${H - PAD_B} L ${x(0).toFixed(1)} ${H - PAD_B} Z`;

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setFocus((f) => Math.min(n - 1, (f ?? -1) + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocus((f) => Math.max(0, (f ?? n) - 1));
    } else if (e.key === 'Escape') {
      setFocus(null);
    }
  };

  const tx = focus !== null ? Math.min(Math.max(x(focus), 46), W - 46) : 0;

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={copy.results.trendAlt(peak.count, dayLabel(peak.date))}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setFocus(null)}
      >
        <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} className={styles.baseline} />
        <path d={area} className={styles.area} />
        <path d={line} className={styles.line} />
        {[0, mid, n - 1].map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            className={styles.axisLabel}
          >
            {dayLabel(trend[i].date)}
          </text>
        ))}
        <text x={x(peakIdx)} y={y(peak.count) - 8} textAnchor="middle" className={styles.peakLabel}>
          {peak.count}
        </text>
        {trend.map((t, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(t.count)}
            r={i === focus ? 5 : 3}
            className={styles.point}
            onMouseEnter={() => setFocus(i)}
            onMouseLeave={() => setFocus(null)}
          />
        ))}
        {focus !== null && (
          <g>
            <rect x={tx - 44} y={Math.max(y(trend[focus].count) - 46, 2)} width={88} height={28} rx={6} className={styles.tipBox} />
            <text x={tx} y={Math.max(y(trend[focus].count) - 46, 2) + 18} textAnchor="middle" className={styles.tipText}>
              {dayLabel(trend[focus].date)} · {trend[focus].count} posts
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
