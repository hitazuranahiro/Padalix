import styles from "./loading.module.css";

export default function StellarTestnetLoading() {
  return (
    <main className={styles.screen} aria-live="polite" aria-busy="true">
      <header className={styles.header}>
        <div className={styles.brand} aria-label="Padalix">
          <i aria-hidden="true"><b /><b /><b /></i>
          <strong>PADALIX</strong>
        </div>
        <span>STELLAR TESTNET</span>
      </header>
      <section className={styles.content}>
        <div className={styles.signal} aria-hidden="true"><i /><i /><i /></div>
        <p>SECURE NETWORK SESSION</p>
        <h1>Preparing your testnet workspace.</h1>
        <span>Establishing a secure testnet session.</span>
        <div className={styles.progress} aria-hidden="true"><i /></div>
      </section>
    </main>
  );
}
