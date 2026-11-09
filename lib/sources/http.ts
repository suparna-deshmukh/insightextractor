export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 InsightExtractor/1.0 (product-research bot)';

export async function httpJson(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 90)}`);
  return res.json();
}

export async function httpText(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<string> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': UA, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 90)}`);
  return res.text();
}

export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u0026amp;/g, '\u0026')
    .replace(/\u0026lt;/g, '\u003c')
    .replace(/\u0026gt;/g, '\u003e')
    .replace(/\u0026quot;/g, '"')
    .replace(/\u0026#39;|\u0026apos;/g, "'")
    .replace(/\u0026nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function redactUsers(s: string): string {
  return s.replace(/(?<![\w/])u\/[A-Za-z0-9_]{2,}/g, '[user]');
}

export function clampDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}
