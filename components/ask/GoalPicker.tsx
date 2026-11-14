'use client';
import { copy } from '@/lib/copy';
import type { GoalKey } from '@/lib/client/form';
import { Field, Input } from '@/components/ui/Field';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import styles from './ask.module.css';

const GOAL_OPTIONS = ([
  ['problem', copy.goals.problem],
  ['validate', copy.goals.validate],
  ['launch', copy.goals.launch],
  ['competitors', copy.goals.competitors],
  ['prioritize', copy.goals.prioritize],
] as const).map(([value, g]) => ({ value, label: g.label }));

export function GoalPicker({
  goal,
  onGoalChange,
  competitors,
  onCompetitorsChange,
}: {
  goal: GoalKey;
  onGoalChange: (goal: GoalKey) => void;
  competitors: string;
  onCompetitorsChange: (value: string) => void;
}) {
  return (
    <div>
      <p className={styles.fieldLabel}>{copy.home.goalLabel}</p>
      <ToggleGroup options={GOAL_OPTIONS} value={goal} onValueChange={(v) => onGoalChange(v as GoalKey)} ariaLabel={copy.home.goalLabel} />
      <p className={styles.goalDesc} aria-live="polite">
        {copy.goals[goal].desc}
      </p>
      {goal === 'competitors' && (
        <div className={styles.inlineCompetitors}>
          <Field label={copy.fine.competitors.label} helper={copy.fine.competitors.helper} htmlFor="ask-competitors">
            <Input
              id="ask-competitors"
              value={competitors}
              onChange={(e) => onCompetitorsChange(e.target.value)}
              placeholder={copy.fine.competitors.placeholder}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
