import { stateError } from "../auth/check-instance";
import { checkErrorMessage } from "../auth/messages";
import { useSession } from "../auth/session-store";
import { bannerOf, useStatus } from "./status-store";
import styles from "./Banner.module.css";

// Functional §2.2, §2.4, §2.5, verbatim; the auth texts are sign-in's (spec 002).
const OFFLINE_TEXT = "Нет соединения. Переподключаемся…";
const KEY_TEXT = "Ключ доступа больше не действует. Войдите заново.";
const STUCK_TEXT = "Не удаётся получить новые сообщения. Пробуем снова…";

/** The one connection or authorization banner, by priority (functional §2.1). */
export function Banner() {
  const banner = useStatus(bannerOf);
  const instanceState = useStatus((s) => s.instanceState);
  const apiUrl = useSession((s) => s.credentials?.apiUrl ?? "");
  const signOut = useSession((s) => s.signOut);

  switch (banner) {
    case null:
      return null;
    case "key":
      return (
        <div role="status" className={`${styles.banner} ${styles.danger}`}>
          <span>{KEY_TEXT}</span>
          <button type="button" className={styles.action} onClick={signOut}>
            Выйти
          </button>
        </div>
      );
    case "auth":
      return (
        <div role="status" className={`${styles.banner} ${styles.danger}`}>
          {checkErrorMessage(stateError(instanceState), apiUrl)}
        </div>
      );
    case "offline":
      return (
        <div role="status" className={`${styles.banner} ${styles.warning}`}>
          {OFFLINE_TEXT}
        </div>
      );
    case "stuck":
      return (
        <div role="status" className={`${styles.banner} ${styles.muted}`}>
          {STUCK_TEXT}
        </div>
      );
  }
}
