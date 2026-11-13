import { describe, expect, it } from 'vitest';
import { deriveTitle } from '@/lib/client/title';

describe('deriveTitle', () => {
  it('keeps a plain question', () => {
    expect(deriveTitle('Why do people stop using budgeting apps after a few weeks? I also want…')).toBe('Why do people stop using budgeting apps after a few weeks');
  });
  it('strips the first-person framing', () => {
    expect(deriveTitle('We want to understand how small restaurants handle online orders.')).toBe('How small restaurants handle online orders');
  });
  it('capitalises short phrases', () => {
    expect(deriveTitle('meal kits in india')).toBe('Meal kits in india');
  });
  it('truncates long input at a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(30).trim(); // 150 chars, no punctuation
    const out = deriveTitle(long);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith('…')).toBe(true);
    expect(out.slice(0, -1)).not.toMatch(/\s$/);
  });
  it('never returns an empty string', () => {
    expect(deriveTitle('ok')).toBe('Ok');
  });
});
