import { beforeEach, describe, expect, it } from 'vitest';
import { renameRun, removeRun, restoreRun } from '@/lib/client/runmeta';

describe('runmeta overlay', () => {
  beforeEach(() => localStorage.clear());

  it('rename persists a title', () => {
    renameRun('run1', '  My title  ');
    expect(JSON.parse(localStorage.getItem('ie:runmeta:v1') || '{}')).toEqual({ run1: { title: 'My title' } });
  });

  it('rename with empty title removes it', () => {
    renameRun('run1', 'Title');
    renameRun('run1', '   ');
    expect(JSON.parse(localStorage.getItem('ie:runmeta:v1') || '{}')).toEqual({});
  });

  it('remove marks removed, restore clears it', () => {
    removeRun('run2');
    expect(JSON.parse(localStorage.getItem('ie:runmeta:v1') || '{}')).toEqual({ run2: { removed: true } });
    restoreRun('run2');
    expect(JSON.parse(localStorage.getItem('ie:runmeta:v1') || '{}')).toEqual({});
  });

  it('restore keeps an existing title', () => {
    renameRun('run3', 'Kept');
    removeRun('run3');
    restoreRun('run3');
    expect(JSON.parse(localStorage.getItem('ie:runmeta:v1') || '{}')).toEqual({ run3: { title: 'Kept' } });
  });
});
