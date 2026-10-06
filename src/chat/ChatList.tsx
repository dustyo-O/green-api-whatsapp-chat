import { useChats, sortChats } from "./chats-store";
import { formatTitle } from "./phone";
import { formatTime } from "./time";
import styles from "./ChatList.module.css";

export function ChatList() {
  const chats = useChats((s) => s.chats);
  const selectedId = useChats((s) => s.selectedId);
  const select = useChats((s) => s.select);
  const sorted = sortChats(chats);

  if (sorted.length === 0) {
    return <p className={styles.empty}>Нет чатов. Нажмите «+», чтобы начать</p>;
  }

  return (
    <ul className={styles.list}>
      {sorted.map((chat) => {
        const last = chat.messages.at(-1);
        return (
          <li key={chat.id}>
            <button
              type="button"
              className={styles.item}
              aria-current={chat.id === selectedId ? "true" : undefined}
              onClick={() => {
                select(chat.id);
              }}
            >
              <span className={styles.title}>{formatTitle(chat.id)}</span>
              {last && (
                <>
                  <time className={styles.time}>{formatTime(last.time)}</time>
                  <span className={styles.preview}>{last.text}</span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
