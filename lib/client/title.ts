export function deriveTitle(description: string): string {
  const MAX = 60;
  let s = (description.trim().split(/(?<=[.?!])\s|\n/)[0] ?? '').trim();
  s = s
    .replace(/^(please\s+)?(i|we)\s*(?:'m|am|are|'re)?\s*(want|need|would like|'d like|trying|hoping|looking)?\s*(to\s+)?(understand|know|find out|learn|see|figure out|research|explore|study|check)?\s+/i, '')
    .replace(/^(please\s+)?(find out|tell me|show me)\s+/i, '')
    .replace(/[.?!:;,\s]+$/, '');
  if (s.length < 3) s = description.trim().slice(0, MAX);
  if (s.length > MAX) s = s.slice(0, MAX).replace(/\s+\S*$/, '') + '…';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
