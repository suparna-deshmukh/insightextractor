'use client';
import { copy } from '@/lib/copy';
import type { GoalKey } from '@/lib/client/form';
import styles from './ask.module.css';

const GOAL_LABEL: Record<GoalKey, string> = {
  problem: copy.goals.problem.label,
  validate: copy.goals.validate.label,
  launch: copy.goals.launch.label,
  competitors: copy.goals.competitors.label,
  prioritize: copy.goals.prioritize.label,
};

export function ExampleList({ onPick }: { onPick: (text: string, goal: GoalKey, competitors?: string) => void }) {
  return (
    <section className={styles.examples}>
      <h2 className={styles.examplesTitle}>{copy.home.examplesTitle}</h2>
      {copy.examples.map((ex) => (
        <button key={ex.text} type="button" className={styles.exampleRow} onClick={() => onPick(ex.text, ex.goal, (ex as { competitors?: string }).competitors)}>
          <span className={styles.exampleText}>{ex.text}</span>
          <span className={styles.exampleGoal}>{GOAL_LABEL[ex.goal]}</span>
        </button>
      ))}
    </section>
  );
}
