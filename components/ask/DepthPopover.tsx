'use client';
import { copy } from '@/lib/copy';
import { OptionList } from '@/components/ui/OptionList';
import styles from './ask.module.css';

export function DepthPopover({
  depth,
  onApply,
  onClose,
}: {
  depth: 'quick' | 'deep';
  onApply: (depth: 'quick' | 'deep') => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.popPanel}>
      <p className={styles.popTitle}>{copy.depth.title}</p>
      <OptionList
        ariaLabel={copy.depth.title}
        value={depth}
        onValueChange={(v) => {
          onApply(v);
          onClose();
        }}
        options={[
          { value: 'quick', label: copy.depth.quick.label, description: copy.depth.quick.desc },
          { value: 'deep', label: copy.depth.deep.label, description: copy.depth.deep.desc },
        ]}
      />
    </div>
  );
}
