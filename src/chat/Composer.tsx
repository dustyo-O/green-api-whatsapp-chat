import { useSession } from "../auth/session-store";
import { useChats, type Chat } from "./chats-store";
import { pausedBy, useStatus, type BannerKind } from "./status-store";
import styles from "./Composer.module.css";

/** GREEN-API's `sendMessage` limit. */
const MAX_LENGTH = 20_000;

// Why sending is paused (spec 005 functional §2.6), verbatim.
const PAUSED: Record<Exclude<BannerKind, "stuck">, string> = {
  offline: "Нет соединения — сообщение можно будет отправить позже",
  auth: "Инстанс не авторизован — отправка недоступна",
  key: "Ключ доступа не действует — отправка недоступна",
};

export function Composer({ chatId }: { chatId: string }) {
  const draft = useChats(
    (s) => (s.chats[chatId] as Chat | undefined)?.draft ?? "",
  );
  const setDraft = useChats((s) => s.setDraft);
  const send = useChats((s) => s.send);
  const credentials = useSession((s) => s.credentials);
  const paused = useStatus(pausedBy);

  return (
    <footer className={styles.footer}>
      <textarea
        className={styles.box}
        rows={1}
        maxLength={MAX_LENGTH}
        placeholder={paused === null ? "Введите сообщение" : PAUSED[paused]}
        value={draft}
        onChange={(e) => {
          setDraft(chatId, e.target.value);
        }}
        onKeyDown={(e) => {
          // Shift+Enter adds a line; Enter while an IME is composing confirms the word.
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) {
            return;
          }
          e.preventDefault();
          // Trim only tests emptiness; the text goes out as typed. `send` keeps it while paused.
          if (draft.trim() === "" || credentials === null) return;
          void send(credentials, chatId, draft);
        }}
      />
    </footer>
  );
}
