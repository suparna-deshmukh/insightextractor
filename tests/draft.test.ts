import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, loadDraft, saveDraft } from '@/lib/client/draft';
import { defaultForm } from '@/lib/client/form';

describe('draft store', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when empty', () => {
    expect(loadDraft()).toBeNull();
  });

  it('merges a partial draft over defaults', () => {
    saveDraft({ ...defaultForm, description: 'hello world, a long enough text' });
    const d = loadDraft();
    expect(d?.description).toBe('hello world, a long enough text');
    expect(d?.goal).toBe('problem');
    expect(d?.sources).toEqual(['reddit', 'google']);
  });

  it('tolerates malformed JSON', () => {
    localStorage.setItem('ie:draft:v1', '{oops');
    expect(loadDraft()).toBeNull();
  });

  it('clears', () => {
    saveDraft(defaultForm);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });
});
