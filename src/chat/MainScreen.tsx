import { useEffect, useState } from "react";
import { useSession } from "../auth/session-store";
import { ChatList } from "./ChatList";
import { useChats } from "./chats-store";
import { Conversation } from "./Conversation";
import { NewChatForm } from "./NewChatForm";
import { runReceiveLoop } from "./receive-loop";
import styles from "./MainScreen.module.css";

export function MainScreen() {
  const idInstance = useSession((s) => s.credentials?.idInstance ?? "");
  const credentials = useSession((s) => s.credentials);
  const signOut = useSession((s) => s.signOut);
  const selectedId = useChats((s) => s.selectedId);
  const [newChat, setNewChat] = useState(false);

  // Mounted exactly while signed in, after the chats store is open; logout unmounts it.
  useEffect(() => {
    if (credentials === null) return;
    const controller = new AbortController();
    void runReceiveLoop(credentials, controller.signal);
    return () => {
      controller.abort();
    };
  }, [credentials]);

  return (
    <main className={styles.layout}>
      <aside className={styles.sidebar}>
        <header className={styles.header}>
          <span className={styles.instance}>{`Инстанс ${idInstance}`}</span>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.add}
              aria-label="Новый чат"
              aria-expanded={newChat}
              onClick={() => {
                setNewChat(!newChat);
              }}
            >
              +
            </button>
            <button type="button" className={styles.logout} onClick={signOut}>
              Выйти
            </button>
          </div>
        </header>
        {newChat && (
          <NewChatForm
            onDone={() => {
              setNewChat(false);
            }}
          />
        )}
        <ChatList />
      </aside>
      {selectedId === null ? (
        <section className={styles.intro}>
          <p>Выберите чат, чтобы начать переписку</p>
        </section>
      ) : (
        <Conversation chatId={selectedId} />
      )}
    </main>
  );
}
