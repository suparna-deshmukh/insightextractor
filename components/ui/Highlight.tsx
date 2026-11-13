import styles from './Highlight.module.css';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const clean = Array.from(
    new Set(terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3)),
  ).slice(0, 12);
  if (!clean.length) return <>{text}</>;
  clean.sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${clean.map(escapeRegex).join('|')})`, 'gi');
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className={styles.mark}>
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
