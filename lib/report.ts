import { BucketStats, EvidenceRecord, Plan, RedditAudit, RunRequest, SourceId, TimeFrame } from './types';

export const SOURCE_LABELS: Record<SourceId, string> = {
  hn: 'Hacker News',
  reddit: 'Reddit',
  appstore: 'App Store',
  play: 'Play Store',
  github: 'GitHub',
  google: 'Google Autocomplete',
  producthunt: 'Product Hunt',
  youtube: 'YouTube',
};

export function describeTimeframe(tf: TimeFrame): string {
  if (tf.preset === 'all') return 'all time';
  if (tf.preset === 'custom') return `${tf.start} → ${tf.end}`;
  return `last ${tf.preset}`;
}

export function buildFallbackReport(req: RunRequest, plan: Plan, bucketStats: BucketStats[], errorNote?: string): string {
  const total = bucketStats.reduce((s, b) => s + b.count, 0);
  const strength = total >= 300 ? 'STRONG' : total >= 80 ? 'MODERATE' : 'THIN';
  const lines: string[] = [];
  lines.push(`# USER INSIGHTS REPORT — ${req.topic.toUpperCase()}`);
  lines.push('');
  if (errorNote) {
    lines.push(`> **${errorNote}**`);
    lines.push('');
  }
  lines.push(`_Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · Mode: heuristic-fallback (no Gemini key) · Timeframe: ${describeTimeframe(req.timeframes.default)}_`);
  lines.push('');
  lines.push('## 1. SNAPSHOT');
  lines.push(`- Records analyzed: **${total}**`);
  lines.push(`- Platforms: ${req.platforms.map((p) => SOURCE_LABELS[p]).join(', ')}`);
  lines.push(`- Objective: ${req.objective}`);
  lines.push(`- Signal strength: **${strength}**`);
  lines.push('');
  lines.push('## 2. TOP INSIGHT BUCKETS');
  lines.push('| Bucket | n | Share | Avg score | Sentiment |');
  lines.push('|---|---|---|---|---|');
  for (const b of bucketStats) {
    lines.push(`| ${b.bucket.name} | ${b.count} | ${b.share}% | ${b.avgScore} | +${b.positive} / −${b.negative} / ${b.neutral} |`);
  }
  lines.push('');
  lines.push('## 3. WHAT USERS LOVE');
  const love = bucketStats.filter((b) => b.bucket.kind === 'praise' || b.positive > b.negative).slice(0, 4);
  if (love.length) for (const b of love) lines.push(`- **${b.bucket.name}** — ${b.count} records (${b.share}%)`);
  else lines.push('- Insufficient positive signal in this window.');
  lines.push('');
  lines.push('## 4. WHAT USERS HATE');
  const hate = bucketStats.filter((b) => b.bucket.kind === 'pain' || b.negative > b.positive).slice(0, 5);
  if (hate.length) for (const b of hate) lines.push(`- **${b.bucket.name}** — ${b.count} records (${b.share}%)`);
  else lines.push('- No dominant pain signals detected.');
  lines.push('');
  lines.push('## 5. UNMET NEEDS & FEATURE REQUESTS');
  const feats = bucketStats.filter((b) => b.bucket.kind === 'feature-request');
  if (feats.length) for (const b of feats) lines.push(`- **${b.bucket.name}** — ${b.count} requests (${b.share}%)`);
  else lines.push('- No explicit feature-request cluster found.');
  lines.push('');
  lines.push('## 6. VOICE OF THE USER');
  for (const b of bucketStats.slice(0, 3)) {
    lines.push(`**${b.bucket.name}**`);
    for (const q of b.topQuotes.slice(0, 2)) lines.push(`- “${(q.title + ' ' + q.body).slice(0, 180)}…” _[${SOURCE_LABELS[q.source]}, ${q.date}]_`);
    lines.push('');
  }
  lines.push('## 7. MOMENTUM & TRENDS');
  lines.push('- Trend data limited in fallback mode. Re-run with a Gemini key for full analysis.');
  lines.push('');
  lines.push('## 8. RECOMMENDATIONS');
  lines.push(`- **P1 — Widen the evidence base.** Set GEMINI_API_KEY and re-run for LLM-synthesized insights.`);
  lines.push(`- **P2 — ${bucketStats[0] ? `Investigate “${bucketStats[0].bucket.name}”` : 'Re-run'}.** Largest bucket by volume.`);
  lines.push('');
  lines.push('## 9. METHOD & DATA APPENDIX');
  lines.push(`- Keywords: ${plan.keywords.join(', ')}`);
  lines.push(`- Bucketing: rule-based (no LLM). For production-quality buckets, provide GEMINI_API_KEY.`);
  lines.push('- Sources are live public APIs; results are a sample of the full discourse, not a census.');
  return lines.join('\n');
}

export function toCsv(labeled: (import('./types').EvidenceRecord & { bucket: number; sentiment: string })[], bucketName: (id: number) => string): string {
  const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = 'id,source,bucket,sentiment,score,date,author,title,url';
  const rows = labeled.map((r) =>
    [r.id, r.source, `${r.bucket}|${bucketName(r.bucket)}`, r.sentiment, r.score, r.date, r.author, r.title, r.url].map((x) => esc(String(x))).join(',')
  );
  return [header, ...rows].join('\n');
}

/**
 * Raw Data output: one CSV row per raw relevant insight record
 * (source, bucket, sentiment, score, full text, source URL).
 */
export function buildRawCsv(rows: (EvidenceRecord & { bucket: number; sentiment: string })[], bucketName: (id: number) => string): string {
  const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = 'id,source,bucket_id,bucket,sentiment,relevance,score,rating,date,author,title,url,body';
  const out = rows.map((r) =>
    [r.id, r.source, r.bucket, bucketName(r.bucket), r.sentiment, 'relevant', r.score, r.rating ?? '', r.date, r.author, r.title, r.url, r.body]
      .map((x) => esc(String(x))).join(',')
  );
  return [header, ...out].join('\n');
}

/** Minimal markdown for Raw Data runs — the CSV is the primary artifact. */
export function buildRawDataReport(req: RunRequest, plan: Plan, relevantCount: number, keptCount: number, totalRecords: number, redditAudit: RedditAudit | null): string {
  const lines: string[] = [];
  lines.push(`# USER INSIGHTS REPORT — ${req.topic.toUpperCase()}`);
  lines.push('');
  lines.push(`_Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · Output: Raw Data · Timeframe: ${describeTimeframe(req.timeframes.default)}_`);
  lines.push('');
  lines.push('## DATA NOTE');
  lines.push('- This run uses the **Raw Data** output: the primary artifact is the CSV of raw relevant insights (⬇ .csv button in the app, or the `rawCsv` field of the JSON export). No synthesized sections.');
  lines.push(`- Relevant insights in the CSV: **${relevantCount}** (of ${keptCount} kept after the relevance pre-filter; ${Math.max(0, totalRecords - keptCount)} raw records dropped before labeling).`);
  lines.push(`- Platforms: ${req.platforms.map((p) => SOURCE_LABELS[p]).join(', ')}`);
  lines.push(`- Objective: ${req.objective}`);
  lines.push(`- Keywords: ${plan.keywords.join(', ')}`);
  if (redditAudit) lines.push(`- Reddit channel audit: ${JSON.stringify(redditAudit)}`);
  lines.push('- Each CSV row is one raw insight record: source, bucket, sentiment, score, date, author, title, source URL and the full text.');
  return lines.join('\n');
}
