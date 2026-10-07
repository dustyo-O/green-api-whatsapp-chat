import { useChats, sortChats } from "./chats-store";
import { UNSUPPORTED_TEXT } from "./notification";
import { chatTitle } from "./phone";
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
    <ul className={styles.list} aria-label="Чаты">
      {sorted.map((chat) => {
        const last = chat.messages.at(-1);
        const unread = chat.unread ?? 0;
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
              <span className={styles.title}>{chatTitle(chat)}</span>
              {last && (
                <>
                  <time className={styles.time}>{formatTime(last.time)}</time>
                  <span className={styles.preview}>
                    {last.text ?? UNSUPPORTED_TEXT}
                  </span>
                </>
              )}
              {unread > 0 && (
                <span
                  className={styles.badge}
                  aria-label={`${String(unread)} непрочитанных`}
                >
                  {unread}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
