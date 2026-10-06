import { useSession } from "../auth/session-store";
import { useChats, type Chat } from "./chats-store";
import styles from "./Composer.module.css";

/** GREEN-API's `sendMessage` limit. */
const MAX_LENGTH = 20_000;

export function Composer({ chatId }: { chatId: string }) {
  const draft = useChats(
    (s) => (s.chats[chatId] as Chat | undefined)?.draft ?? "",
  );
  const setDraft = useChats((s) => s.setDraft);
  const send = useChats((s) => s.send);
  const credentials = useSession((s) => s.credentials);

  return (
    <footer className={styles.footer}>
      <textarea
        className={styles.box}
        rows={1}
        maxLength={MAX_LENGTH}
        placeholder="Введите сообщение"
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
          // Trim only tests emptiness; the text goes out as typed.
          if (draft.trim() === "" || credentials === null) return;
          void send(credentials, chatId, draft);
        }}
      />
    </footer>
  );
}
