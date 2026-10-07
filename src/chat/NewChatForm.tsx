import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useSession } from "../auth/session-store";
import { useChats } from "./chats-store";
import { checkNumber, type CheckOutcome } from "./outcomes";
import { COUNTRIES, isValidCode, isValidNumber, toChatId } from "./phone";
import { pausedBy, useStatus } from "./status-store";
import styles from "./NewChatForm.module.css";

type CheckError = Exclude<CheckOutcome, "exists">;

const ERRORS: Record<CheckError, string> = {
  notOnWhatsapp: "На этом номере нет WhatsApp",
  invalidNumber: "Неверный номер. Проверьте код страны и номер.",
  checkFailed: "Не удалось проверить номер. Попробуйте ещё раз.",
};

interface NewChatFormProps {
  /** The chat is open: the row closes. */
  onDone: () => void;
}

export function NewChatForm({ onDone }: NewChatFormProps) {
  const [countryId, setCountryId] = useState(COUNTRIES[0].id);
  const [customCode, setCustomCode] = useState("");
  const [number, setNumber] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<CheckError | null>(null);
  // No new chat while sending is paused (spec 005 functional §2.6).
  const paused = useStatus((s) => pausedBy(s) !== null);
  // Cleared when the row closes: a check still running then belongs to no form.
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const other = countryId === "other";
  const code = other
    ? customCode
    : (COUNTRIES.find((c) => c.id === countryId)?.code ?? "");
  const submittable =
    isValidNumber(number) && (!other || isValidCode(customCode));

  async function start() {
    const chatId = toChatId(code, number);
    const chats = useChats.getState();
    if (chatId in chats.chats) {
      chats.addChat(chatId);
      onDone();
      return;
    }
    const credentials = useSession.getState().credentials;
    if (credentials === null) return;
    const session = chats.session;
    setChecking(true);
    setError(null);
    const outcome = await checkNumber(credentials, chatId);
    // The row was closed, or a logout or a sign-in (even with the same instance) happened
    // while checking: this answer is stale.
    if (!active.current || useChats.getState().session !== session) return;
    setChecking(false);
    // Paused while checking: no chat, and the number stays for later (review 3 F4).
    if (pausedBy(useStatus.getState()) !== null) return;
    if (outcome === "exists") {
      useChats.getState().addChat(chatId);
      onDone();
    } else {
      setError(outcome);
    }
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checking || !submittable || paused) return;
    void start();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <fieldset className={styles.fields} disabled={checking}>
        <div className={styles.row}>
          <select
            className={styles.input}
            aria-label="Страна"
            value={countryId}
            onChange={(e) => {
              setCountryId(e.target.value);
            }}
          >
            {COUNTRIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id === "other" ? c.name : `${c.flag} ${c.name} +${c.code}`}
              </option>
            ))}
          </select>
          {other && (
            <span className={styles.code}>
              +
              <input
                className={styles.input}
                aria-label="Код страны"
                inputMode="numeric"
                value={customCode}
                onChange={(e) => {
                  setCustomCode(e.target.value);
                }}
              />
            </span>
          )}
        </div>
        <div className={styles.row}>
          <input
            className={styles.input}
            aria-label="Номер телефона"
            inputMode="tel"
            autoComplete="off"
            autoFocus
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
            }}
          />
          <button
            type="submit"
            className={styles.submit}
            disabled={checking || !submittable || paused}
            aria-busy={checking}
          >
            {checking ? "Проверяем…" : "Начать чат"}
          </button>
        </div>
      </fieldset>
      {error !== null && (
        <p role="alert" className={styles.error}>
          {ERRORS[error]}
        </p>
      )}
    </form>
  );
}
