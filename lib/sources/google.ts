import { EvidenceRecord, Plan, PipelineMode, TimeFrame, SourceId } from '../types';
import { httpJson } from './http';
import { Provider, withTimeout } from './provider';

export const META = { id: 'google' as SourceId, label: 'Google Autocomplete', icon: '\u{1F50E}', tagline: 'Live search-demand signal: how people phrase this topic right now', keyless: true };

export const JOBS: (plan: Plan, _tf: TimeFrame, mode: PipelineMode) => string[] = (plan, _tf, mode) =>
  plan.keywords.slice(0, mode === 'rapid' ? 3 : 4);

async function suggest(client: string, shards: string[], mode: PipelineMode): Promise<EvidenceRecord[]> {
  const out: EvidenceRecord[] = [];
  for (const t of shards) {
    const data = await httpJson(`https://suggestqueries.google.com/complete/search?client=${client}&hl=en&q=${encodeURIComponent(t)}`);
    const suggestions: string[] = Array.isArray(data?.[1]) ? data[1] : [];
    suggestions.slice(0, 8).forEach((s, i) => {
      out.push({
        id: `google-${client}-${encodeURIComponent(t)}-${i}`,
        source: 'google',
        title: s,
        body: `Autocomplete suggestion for "${t}" — indicates current search demand.`,
        url: `https://www.google.com/search?q=${encodeURIComponent(s)}`,
        author: '',
        date: new Date().toISOString().slice(0, 10),
        score: 10 - i,
      });
    });
  }
  return out;
}

async function ddgRelated(shards: string[], _tf: TimeFrame, mode: PipelineMode): Promise<EvidenceRecord[]> {
  const out: EvidenceRecord[] = [];
  for (const t of shards) {
    const data = await httpJson(`https://api.duckduckgo.com/?q=${encodeURIComponent(t)}&format=json&no_html=1&skip_disambig=1`);
    const topics: any[] = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
    const flat = topics.flatMap((x) => (x.FirstURL ? [x] : (x.Topics ?? []))).slice(0, 6);
    flat.forEach((x, i) => {
      out.push({
        id: `google-ddg-${encodeURIComponent(t)}-${i}`,
        source: 'google',
        title: x.Text ?? '',
        body: `Related-topic suggestion from web search index for "${t}".`,
        url: x.FirstURL ?? `https://duckduckgo.com/?q=${encodeURIComponent(t)}`,
        author: '',
        date: new Date().toISOString().slice(0, 10),
        score: 6 - i,
      });
    });
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!out.length) throw new Error('no related topics');
  return out;
}

export const PROVIDERS: Provider[] = [
  { id: 'google-suggest-firefox', name: 'Google Suggest (firefox)', timeoutMs: 12_000, fetch: (sh, _p, _t, m) => withTimeout(suggest('firefox', sh, m), 12_000, 'google-suggest-firefox') },
  { id: 'google-suggest-chrome', name: 'Google Suggest (chrome)', timeoutMs: 12_000, fetch: (sh, _p, _t, m) => withTimeout(suggest('chrome', sh, m), 12_000, 'google-suggest-chrome') },
  { id: 'google-ddg-related', name: 'DDG related topics', timeoutMs: 15_000, fetch: (sh, _p, t, m) => withTimeout(ddgRelated(sh, t, m), 15_000, 'google-ddg-related') },
];
