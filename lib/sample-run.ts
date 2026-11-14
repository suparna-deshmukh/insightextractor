import type { EvidenceRecord, RunRequest, RunResult, SourceId } from './types';

const DAY = 86_400_000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY).toISOString();
}

const request: RunRequest = {
  topic: 'Meal-kit delivery in India',
  description: 'How do people in India actually experience meal-kit delivery?',
  objective: 'problem-discovery',
  competitors: [],
  industry: 'Food & Beverage',
  audience: 'Urban professionals',
  keywords: ['meal kit', 'delivery delay', 'hidden charges', 'fresh ingredients', 'pause subscription'],
  focusAreas: ['Features & gaps'],
  compareCompetitors: false,
  reportLength: 'standard',
  tone: 'neutral',
  appsHint: [],
  brandHint: '',
  platforms: ['reddit', 'google', 'hn'],
  timeframes: { default: { preset: '30d' }, overrides: {} },
  format: 'one-pager',
  mode: 'rapid',
};

const QUOTES = [
  { title: 'Box arrived two days late', body: 'The kit arrived two days after the promised date and the vegetables were wilted. This is what a sample quote looks like.', author: 'sample_user_1', source: 'reddit' as const, date: daysAgo(2), score: 41 },
  { title: 'Half my items were missing', body: 'Three of the eight items were missing from the box. A replacement was promised but never sent. (Illustrative text.)', author: 'sample_user_2', source: 'reddit' as const, date: daysAgo(6), score: 27 },
  { title: 'Late delivery again', body: 'This is the second time in a month the delivery was late. A generic example, not a real claim.', author: 'sample_user_3', source: 'reddit' as const, date: daysAgo(11), score: 19 },
  { title: 'Charges I did not expect', body: 'The checkout price did not include a delivery fee I only saw later. A made-up example for the demo.', author: 'sample_user_4', source: 'google' as const, date: daysAgo(4), score: 33 },
  { title: 'Price jumped at renewal', body: 'The renewal price was higher than the first month with no clear notice. Illustrative, not factual.', author: 'sample_user_5', source: 'google' as const, date: daysAgo(9), score: 22 },
  { title: 'Why is there a small-order fee?', body: 'A question about a small-order fee, written as a neutral search-style example.', author: 'sample_user_6', source: 'google' as const, date: daysAgo(15), score: 12 },
  { title: 'The food was genuinely fresh', body: 'For a sample quote: the ingredients were fresh and the recipes were easy to follow.', author: 'sample_user_7', source: 'hn' as const, date: daysAgo(3), score: 52 },
  { title: 'Tasty and reasonably portioned', body: 'Portions felt right for two people. This line is invented for the sample report.', author: 'sample_user_8', source: 'reddit' as const, date: daysAgo(8), score: 38 },
  { title: 'A welcome change from cooking daily', body: 'A positive example voice about saving time on weeknights. Clearly sample content.', author: 'sample_user_9', source: 'hn' as const, date: daysAgo(13), score: 29 },
  { title: 'I want to pause, not cancel', body: 'Request to pause deliveries for a month without losing the subscription. Example feature ask.', author: 'sample_user_10', source: 'reddit' as const, date: daysAgo(5), score: 44 },
  { title: 'Smaller plans would help', body: 'A single-person plan does not exist in this fictional scenario. Generic request.', author: 'sample_user_11', source: 'google' as const, date: daysAgo(10), score: 21 },
  { title: 'Let me skip one recipe', body: 'Skip a single recipe for one box instead of the whole plan. Invented request.', author: 'sample_user_12', source: 'reddit' as const, date: daysAgo(17), score: 17 },
  { title: 'The plan changed without asking', body: 'A complaint-style example about a plan change that was not clearly announced.', author: 'sample_user_13', source: 'hn' as const, date: daysAgo(7), score: 15 },
  { title: 'Cancel, then re-subscribe, then cancel again', body: 'An example of confusing subscription states in this demo data.', author: 'sample_user_14', source: 'reddit' as const, date: daysAgo(12), score: 11 },
  { title: 'The app and the email disagree', body: 'A sample note that two places in a fictional app show different plan details.', author: 'sample_user_15', source: 'google' as const, date: daysAgo(19), score: 9 },
];

const buckets = [
  { id: 1, name: 'Late and missing deliveries', kind: 'pain' as const, share: 31, count: 135, pos: 8, neg: 104, neu: 23, avg: 22, desc: 'Delivery windows that are missed, boxes that arrive incomplete, and support loops that do not resolve the issue. In this sample, this is the loudest theme.' },
  { id: 2, name: 'Pricing and hidden charges', kind: 'pain' as const, share: 26, count: 113, pos: 6, neg: 79, neu: 28, avg: 18, desc: 'Fees that appear at checkout or renewal rather than on the plan page. Illustrative theme, not a measured statistic.' },
  { id: 3, name: 'Fresh, tasty ingredients', kind: 'praise' as const, share: 19, count: 83, pos: 62, neg: 9, neu: 12, avg: 34, desc: 'The core promise that works in this fictional dataset: fresh ingredients and simple recipes.' },
  { id: 4, name: 'Pausable plans and smaller sizes', kind: 'feature-request' as const, share: 14, count: 61, pos: 24, neg: 9, neu: 28, avg: 26, desc: 'Requests to pause for a month, order for one person, or skip a single recipe. All invented asks.' },
  { id: 5, name: 'Confusing subscription changes', kind: 'confusion' as const, share: 10, count: 43, pos: 7, neg: 12, neu: 24, avg: 12, desc: 'Example complaints about plan changes and cancellation states that are hard to follow.' },
];

function quotesFor(bucketId: number): EvidenceRecord[] {
  const map: Record<number, number[]> = { 1: [0, 1, 2], 2: [3, 4, 5], 3: [6, 7, 8], 4: [9, 10, 11], 5: [12, 13, 14] };
  return (map[bucketId] ?? []).slice(0, 2).map((i) => ({ id: `sample-q${i + 1}`, url: '', ...QUOTES[i] }));
}

const bySourceSplit: { source: SourceId; count: number }[][] = [
  [{ source: 'reddit', count: 78 }, { source: 'google', count: 39 }, { source: 'hn', count: 18 }],
  [{ source: 'google', count: 48 }, { source: 'reddit', count: 44 }, { source: 'hn', count: 21 }],
  [{ source: 'reddit', count: 41 }, { source: 'hn', count: 27 }, { source: 'google', count: 15 }],
  [{ source: 'reddit', count: 29 }, { source: 'google', count: 22 }, { source: 'hn', count: 10 }],
  [{ source: 'reddit', count: 21 }, { source: 'hn', count: 14 }, { source: 'google', count: 8 }],
];

const report = `# USER INSIGHTS REPORT — MEAL-KIT DELIVERY IN INDIA

_Generated from the built-in sample. Every name, quote and number on this page is invented for demonstration._

## 1. SNAPSHOT

In this sample, meal-kit buyers talk most about delivery that is late or incomplete, then about fees that surface too late in the journey.

- Records analyzed: **435** (illustrative)
- Platforms: Reddit, Google searches, Hacker News
- Timeframe: past month
- Note: This is a built-in sample report. It exists so you can see the shape of a real report before running your own research.

## 2. TOP INSIGHT BUCKETS

| Bucket | n | Share | Avg score | Sentiment |
|---|---|---|---|---|
| Late and missing deliveries | 135 | 31% | 22 | +8 / −104 / 23 |
| Pricing and hidden charges | 113 | 26% | 18 | +6 / −79 / 28 |
| Fresh, tasty ingredients | 83 | 19% | 34 | +62 / −9 / 12 |
| Pausable plans and smaller sizes | 61 | 14% | 26 | +24 / −9 / 28 |
| Confusing subscription changes | 43 | 10% | 12 | +7 / −12 / 24 |

## 3. WHAT USERS LOVE

In this fictional dataset, the praise clusters around the product's core promise.

- Ingredients arrive fresh, and recipes stay simple.
- Portion sizes feel right for small households.
- Weeknight time saving is mentioned as a real benefit.

All of the above is invented for the sample.

## 4. WHAT USERS HATE

The frustrations in this sample follow two lines.

- Delivery windows that are missed, with items missing from the box.
- Fees and price changes that appear later than people expected.

These are example patterns, not findings about any real service.

## 5. UNMET NEEDS & FEATURE REQUESTS

1. Pause a subscription for a month without cancelling.
2. Smaller plans for one or two people.
3. Skip a single recipe in one box instead of the whole plan.

## 6. VOICE OF THE USER

> "The kit arrived two days after the promised date and the vegetables were wilted."
> — sample_user_1, Reddit

> "For a sample quote: the ingredients were fresh and the recipes were easy to follow."
> — sample_user_7, Hacker News

Both quotes above are invented.

## 7. MOMENTUM & TRENDS

Mention volume in this sample is fairly flat, with one visible peak mid-month that lines up with an invented "sale" event. Treat the shape, not the numbers, as the point.

## 8. RECOMMENDATIONS

1. Fix delivery reliability before anything else; it is the loudest theme here.
2. Show every fee on the plan page, before checkout.
3. Add a pause flow so people do not have to cancel to take a break.

## 9. METHOD & DATA APPENDIX

This page is a static sample. It was not produced by the pipeline: there are no real posts, no real users and no real statistics behind it. Running your own research reads live public sources and shows real (anonymized) data.
`;

export function sampleRun() {
  const labeled = Array.from({ length: 40 }, (_, i) => {
    const q = QUOTES[i % QUOTES.length];
    const bucketId = i % 5;
    return {
      id: `sample-${i + 1}`,
      source: q.source,
      title: q.title,
      body: q.body,
      url: '',
      author: q.author,
      date: daysAgo(1 + ((i * 7) % 30)),
      score: q.score,
      bucket: bucketId + 1,
      sentiment: i % 3 === 0 ? 'negative' : i % 3 === 1 ? 'positive' : 'neutral',
    };
  });

  const result: RunResult = {
    topic: request.topic,
    description: request.description,
    objective: request.objective,
    timeframe: request.timeframes.default,
    plan: {
      keywords: request.keywords,
      queries: { reddit: ['meal kit delivery delayed'], google: ['meal kit hidden charges'], hn: ['meal kit worth it'] },
      apps: [],
      subreddits: [],
      lookFor: ['delivery reliability', 'pricing surprises', 'freshness praise', 'pause and resize requests'],
      hypotheses: ['Delivery reliability drives more complaints than price.'],
      problemStatement: 'Illustrative sample: how people in India experience meal-kit delivery.',
      objective: 'problem-discovery',
    },
    totalRecords: 512,
    keptRecords: 435,
    irrelevantDropped: 77,
    perSource: [
      { source: 'reddit', fetched: 240, kept: 210 },
      { source: 'google', fetched: 160, kept: 142 },
      { source: 'hn', fetched: 112, kept: 83 },
    ],
    buckets: buckets.map((b, i) => ({
      bucket: { id: b.id, name: b.name, description: b.desc, kind: b.kind },
      count: b.count,
      share: b.share,
      avgScore: b.avg,
      positive: b.pos,
      negative: b.neg,
      neutral: b.neu,
      bySource: bySourceSplit[i],
      topQuotes: quotesFor(b.id),
    })),
    trend: Array.from({ length: 30 }, (_, i) => ({
      date: daysAgo(29 - i),
      count: i === 21 ? 38 : 8 + ((i * 5) % 7),
    })),
    labeled,
    rawCsv: '',
    sqlAudit: [
      { stage: 'collect', sql: "SELECT * FROM sample_records WHERE source IN ('reddit','google','hn')", rows: 512, summary: 'Illustrative collect step for the sample.' },
      { stage: 'label', sql: 'SELECT id, bucket, sentiment FROM sample_labels', rows: 435, summary: 'Illustrative labelling step for the sample.' },
      { stage: 'trend', sql: 'SELECT day, COUNT(*) FROM sample_records GROUP BY day', rows: 30, summary: 'Illustrative daily counts for the sample.' },
    ],
    report,
    model: 'gemini-3.8-flash',
    usedLlm: true,
    durationMs: 0,
  };

  return {
    id: 'sample',
    ts: Date.now(),
    request,
    result,
  };
}
