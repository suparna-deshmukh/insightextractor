import type { RunResult, StoredRun } from '@/lib/client/types';

export const BOM = '\uFEFF';

export function withBom(s: string): string {
  return s.startsWith(BOM) ? s : BOM + s;
}

export function slug(title: string): string {
  let s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (s.length > 50) s = s.slice(0, 50).replace(/_+$/, '');
  return s;
}

export function fileNames(title: string) {
  const s = slug(title);
  return {
    md: `insight_extractor_${s}_insights.md`,
    csv: `insight_extractor_${s}_evidence.csv`,
    rawCsv: `insight_extractor_${s}_raw_insights.csv`,
    json: `insight_extractor_${s}_data.json`,
  };
}

export function csvCell(v: string | number): string {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function evidenceCsv(result: RunResult): string {
  const bucketName = (id: number) =>
    result.buckets.find((b) => b.bucket.id === id)?.bucket.name ?? `#${id}`;
  const header = 'id,source,bucket,sentiment,score,date,author,title,url';
  const rows = result.labeled.map((r) =>
    [r.id, r.source, `${r.bucket}|${bucketName(r.bucket)}`, r.sentiment, r.score, r.date, r.author, r.title, r.url]
      .map(csvCell)
      .join(','),
  );
  return withBom([header, ...rows].join('\n'));
}

export function rawCsv(result: RunResult): string {
  return withBom(result.rawCsv);
}

export function runJson(run: StoredRun): string {
  return JSON.stringify(run, null, 2);
}

export function downloadFile(name: string, content: string, mime: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}
