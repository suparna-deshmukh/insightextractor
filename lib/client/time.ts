import { useEffect, useState } from 'react';

export function timeAgo(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (diff < 3600_000) return rtf.format(-Math.round(diff / 60_000), 'minute');
  if (diff < 86400_000) return rtf.format(-Math.round(diff / 3600_000), 'hour');
  if (diff < 30 * 86400_000) return rtf.format(-Math.round(diff / 86400_000), 'day');
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ts));
}

export function formatClock(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}

export function countdown(ms: number): string {
  if (ms <= 0) return 'now';
  if (ms < 60_000) return 'under a minute';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Next midnight in America/Los_Angeles (shared AI capacity resets there). */
export function nextPacificMidnight(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(now);
  // PLAN-NOTE: the plan's verbatim snippet applied % 24 to every part, which
  // corrupted the minute value (e.g. 59 -> 11). Only the hour can read "24"
  // at midnight with hour12: false, so only the hour gets % 24.
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const second = Number(parts.find((p) => p.type === 'second')?.value ?? 0);
  const sinceMidnightMs = (hour * 3600 + minute * 60 + second) * 1000;
  return new Date(now.getTime() + (86_400_000 - sinceMidnightMs));
}

/** Date.now(), updated on an interval; pauses while the tab is hidden. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    let iv: number | null = null;
    const tick = () => setNow(Date.now());
    const start = () => {
      if (iv === null && !document.hidden) iv = window.setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (iv !== null) {
        window.clearInterval(iv);
        iv = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        tick();
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
  return now;
}
