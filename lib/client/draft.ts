import { defaultForm, type FormState } from './form';

const KEY = 'ie:draft:v1';

export function saveDraft(form: FormState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(form));
  } catch {
    /* ignore */
  }
}

/** Read the draft, merged over defaults so older drafts never break. */
export function loadDraft(): FormState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<FormState> | null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return {
      ...defaultForm,
      ...v,
      time: { ...defaultForm.time, ...(v.time ?? {}) },
      focusAreas: Array.isArray(v.focusAreas) ? v.focusAreas.filter((x) => typeof x === 'number') : [],
      sources: Array.isArray(v.sources) ? (v.sources as FormState['sources']) : defaultForm.sources,
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
