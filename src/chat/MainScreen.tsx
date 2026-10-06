import { useSession } from "../auth/session-store";
import styles from "./MainScreen.module.css";

export function MainScreen() {
  const idInstance = useSession((s) => s.credentials?.idInstance ?? "");
  const signOut = useSession((s) => s.signOut);

  return (
    <main className={styles.layout}>
      <aside className={styles.sidebar}>
        <header className={styles.header}>
          <span className={styles.instance}>{`Инстанс ${idInstance}`}</span>
          <button type="button" className={styles.logout} onClick={signOut}>
            Выйти
          </button>
        </header>
      </aside>
      <section className={styles.intro}>
        <p>Выберите чат, чтобы начать переписку</p>
      </section>
    </main>
  );
}
