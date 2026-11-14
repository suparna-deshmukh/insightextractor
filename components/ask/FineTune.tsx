'use client';
import { copy } from '@/lib/copy';
import {
  AUDIENCES,
  FOCUS_AREAS,
  INDUSTRIES,
  type FormState,
  type StyleKey,
} from '@/lib/client/form';
import { showBrandField } from '@/lib/client/signals';
import { Field, Input } from '@/components/ui/Field';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { OptionList } from '@/components/ui/OptionList';
import { Checkbox } from '@/components/ui/Checkbox';
import styles from './ask.module.css';

const FOCUS_LABELS = [
  'Features and gaps',
  'Pricing',
  'Ease of use',
  'Speed and reliability',
  'Privacy and security',
  'Support and onboarding',
  'Integrations',
  'Marketing and positioning',
];

const STYLE_OPTIONS = [
  { value: 'standard', label: copy.fine.style.standard.label, description: copy.fine.style.standard.desc, badge: copy.fine.style.standard.badge },
  { value: 'brief', label: copy.fine.style.brief.label, description: copy.fine.style.brief.desc },
  { value: 'indepth', label: copy.fine.style.indepth.label, description: copy.fine.style.indepth.desc },
  { value: 'sheet', label: copy.fine.style.sheet.label, description: copy.fine.style.sheet.desc },
];

export function FineTune({
  form,
  onChange,
  showInlineCompetitors,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  showInlineCompetitors: boolean;
}) {
  const competitors = form.competitors.trim();
  const competitorsForCompare = competitors ? competitors.split(',').map((x) => x.trim()).filter(Boolean).join(', ') : '';
  void FOCUS_AREAS;
  return (
    <div className={styles.ftGrid}>
      <Field label={copy.fine.name.label} helper={copy.fine.name.helper} htmlFor="ft-name">
        <Input id="ft-name" value={form.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>

      <div className={styles.ftGroup}>
        <p className={styles.ftHeading}>{copy.fine.aboutMarket}</p>
        <div className={styles.ftTwo}>
          <Field label={copy.fine.industry.label} htmlFor="ft-industry">
            <Input id="ft-industry" list="ft-industries" value={form.industry} onChange={(e) => onChange({ industry: e.target.value })} placeholder={copy.fine.industry.placeholder} />
          </Field>
          <Field label={copy.fine.audience.label} htmlFor="ft-audience">
            <Input id="ft-audience" list="ft-audiences" value={form.audience} onChange={(e) => onChange({ audience: e.target.value })} placeholder={copy.fine.audience.placeholder} />
          </Field>
        </div>
        <datalist id="ft-industries">
          {INDUSTRIES.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="ft-audiences">
          {AUDIENCES.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>

      {!showInlineCompetitors && (
        <Field label={copy.fine.competitors.label} helper={copy.fine.competitors.helper} htmlFor="ft-competitors">
          <Input id="ft-competitors" value={form.competitors} onChange={(e) => onChange({ competitors: e.target.value })} placeholder={copy.fine.competitors.placeholder} />
        </Field>
      )}

      {showBrandField(form.description, form.industry) && (
        <Field label={copy.fine.brand.label} helper={copy.fine.brand.helper} htmlFor="ft-brand">
          <Input id="ft-brand" value={form.brand} onChange={(e) => onChange({ brand: e.target.value })} />
        </Field>
      )}

      <Field label={copy.fine.keywords.label} helper={copy.fine.keywords.helper} htmlFor="ft-keywords">
        <Input id="ft-keywords" value={form.keywords} onChange={(e) => onChange({ keywords: e.target.value })} placeholder={copy.fine.keywords.placeholder} />
      </Field>

      <div className={styles.ftGroup}>
        <p className={styles.ftHeading}>{copy.fine.focus.label}</p>
        <ToggleGroup
          ariaLabel={copy.fine.focus.label}
          multiple
          options={FOCUS_LABELS.map((label, i) => ({ value: String(i), label }))}
          value={form.focusAreas.map(String)}
          onValueChange={(v) => onChange({ focusAreas: (v as string[]).map(Number) })}
        />
      </div>

      {competitors && (
        <Checkbox
          checked={form.compare}
          onCheckedChange={(v) => onChange({ compare: v, compareTouched: true })}
          label={copy.fine.compare(competitorsForCompare)}
        />
      )}

      <div className={styles.ftGroup}>
        <p className={styles.ftHeading}>{copy.fine.style.label}</p>
        <OptionList ariaLabel={copy.fine.style.label} value={form.style} onValueChange={(v) => onChange({ style: v as StyleKey })} options={STYLE_OPTIONS} />
      </div>

      <div className={styles.ftTwo}>
        <Field label={copy.fine.length.label}>
          <ToggleGroup
            ariaLabel={copy.fine.length.label}
            options={[
              { value: 'concise', label: copy.fine.length.concise },
              { value: 'standard', label: copy.fine.length.standard },
              { value: 'detailed', label: copy.fine.length.detailed },
            ]}
            value={form.length}
            onValueChange={(v) => onChange({ length: v as FormState['length'] })}
          />
        </Field>
        <Field label={copy.fine.tone.label}>
          <ToggleGroup
            ariaLabel={copy.fine.tone.label}
            options={[
              { value: 'formal', label: copy.fine.tone.formal },
              { value: 'neutral', label: copy.fine.tone.neutral },
              { value: 'conversational', label: copy.fine.tone.conversational },
            ]}
            value={form.tone}
            onValueChange={(v) => onChange({ tone: v as FormState['tone'] })}
          />
        </Field>
      </div>
    </div>
  );
}
