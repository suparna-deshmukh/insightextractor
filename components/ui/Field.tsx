import { forwardRef, useLayoutEffect, useRef } from 'react';
import { CircleAlert } from 'lucide-react';
import styles from './Field.module.css';

export interface FieldProps {
  label?: string;
  helper?: string;
  error?: string;
  optional?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, helper, error, optional, htmlFor, children, className }: FieldProps) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      {label && (
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
          {optional && <span className={styles.optional}> optional</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className={styles.error} role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : helper ? (
        <p className={styles.helper}>{helper}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ invalid, className, ...rest }, ref) {
    return <input ref={ref} className={[styles.input, invalid && styles.invalid, className].filter(Boolean).join(' ')} {...rest} />;
  },
);

const MIN_H = 120;
const MAX_H = 280;

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; bare?: boolean }>(
  function TextArea({ invalid, bare, className, value, onChange, ...rest }, ref) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const setRefs = (el: HTMLTextAreaElement | null) => {
      localRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    };
    useLayoutEffect(() => {
      const el = localRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.min(Math.max(el.scrollHeight, MIN_H), MAX_H) + 'px';
      el.style.overflowY = el.scrollHeight > MAX_H ? 'auto' : 'hidden';
    }, [value]);
    return (
      <textarea
        ref={setRefs}
        className={[styles.textarea, bare && styles.bare, invalid && styles.invalid, className].filter(Boolean).join(' ')}
        value={value}
        onChange={(e) => {
          onChange?.(e);
        }}
        {...rest}
      />
    );
  },
);
