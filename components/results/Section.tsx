import styles from './insights.module.css';

export function Section({
  id,
  heading,
  children,
  first = false,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section id={id} className={first ? styles.sectionFirst : styles.section}>
      <h2 className={styles.sectionHeading}>{heading}</h2>
      {children}
    </section>
  );
}
