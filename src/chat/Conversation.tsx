import { useEffect, useRef } from "react";
import { useSession } from "../auth/session-store";
import { useChats, type Chat, type MessageStatus } from "./chats-store";
import { Composer } from "./Composer";
import { formatTitle } from "./phone";
import { formatTime } from "./time";
import styles from "./Conversation.module.css";

const MARKS: Record<MessageStatus, string> = {
  sending: "🕓",
  sent: "✅",
  failed: "❗",
  unknown: "❔",
};

const PROBLEMS: Partial<Record<MessageStatus, string>> = {
  failed: "Не отправлено",
  unknown: "Статус неизвестен",
};

export function Conversation({ chatId }: { chatId: string }) {
  const chat = useChats((s) => s.chats[chatId] as Chat | undefined);
  const messages = chat?.messages ?? [];
  const retry = useChats((s) => s.retry);
  const credentials = useSession((s) => s.credentials);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chatId, messages.length]);

  return (
    <section className={styles.conversation}>
      <header className={styles.header}>
        <h2 className={styles.title}>{formatTitle(chatId)}</h2>
      </header>
      <ol ref={listRef} className={styles.messages} aria-label="Сообщения">
        {messages.map((m) => {
          const problem = PROBLEMS[m.status];
          return (
            <li key={m.id} className={styles.bubble}>
              <p className={styles.text}>{m.text}</p>
              <span className={styles.meta}>
                <time>{formatTime(m.time)}</time> {MARKS[m.status]}
              </span>
              {problem && (
                <span className={styles.problem}>
                  {`${problem} · `}
                  <button
                    type="button"
                    className={styles.retry}
                    onClick={() => {
                      if (
                        credentials === null ||
                        (m.status === "unknown" &&
                          !window.confirm(
                            "Сообщение могло уже уйти. Отправить ещё раз?",
                          ))
                      ) {
                        return;
                      }
                      void retry(credentials, chatId, m.id);
                    }}
                  >
                    Повторить
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <Composer chatId={chatId} />
    </section>
  );
}
