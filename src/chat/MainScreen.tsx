import { useSession } from "../auth/session-store";

export function MainScreen() {
  const idInstance = useSession((s) => s.credentials?.idInstance ?? "");
  const signOut = useSession((s) => s.signOut);

  return (
    <main>
      <aside>
        <header>
          <span>{`Инстанс ${idInstance}`}</span>
          <button type="button" onClick={signOut}>
            Выйти
          </button>
        </header>
      </aside>
      <section>
        <p>Выберите чат, чтобы начать переписку</p>
      </section>
    </main>
  );
}
