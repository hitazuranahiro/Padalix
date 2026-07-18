import styles from "./loading.module.css";

export default function Loading() {
  return (
    <main className={styles.screen} aria-busy="true" aria-live="polite">
      <div className={styles.loader}>
        <div className={styles.brand} aria-label="Padalix">
          <span className={styles.mark} aria-hidden="true"><i /><i /><i /></span>
          <strong>PADALIX</strong>
        </div>
        <div className={styles.rule} aria-hidden="true"><i /></div>
        <div className={styles.status}>
          <span>SECURE SESSION</span>
          <span>LOADING</span>
        </div>
      </div>
    </main>
  );
}
