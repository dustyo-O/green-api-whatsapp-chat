import { useId, useState, type SubmitEvent } from "react";
import { formatVersion, type BuildInfo } from "../build-info";
import {
  EMPTY_FORM,
  canSubmit,
  deriveApiUrl,
  isValidApiUrl,
  isValidIdInstance,
  normalize,
  shownApiUrl,
  type CredentialsForm,
} from "./credentials";
import { checkErrorMessage } from "./messages";
import styles from "./LoginScreen.module.css";
import { useSession } from "./session-store";

interface LoginScreenProps {
  build: BuildInfo;
}

export function LoginScreen({ build }: LoginScreenProps) {
  const error = useSession((s) => s.error);
  const busy = useSession((s) => s.busy);
  const signIn = useSession((s) => s.signIn);
  // Mounted afresh on every switch to this screen: empty after logout, prefilled after a failed reload.
  const [form, setForm] = useState<CredentialsForm>(
    () => useSession.getState().credentials ?? EMPTY_FORM,
  );
  // The URL the last check used, so editing the field doesn't rewrite the message.
  const [checkedApiUrl, setCheckedApiUrl] = useState(
    () => useSession.getState().credentials?.apiUrl ?? "",
  );
  const [showToken, setShowToken] = useState(false);
  const idHintId = useId();
  const urlHintId = useId();
  const idFieldId = useId();
  const tokenFieldId = useId();
  const urlFieldId = useId();

  const values = normalize(form);
  const submittable = canSubmit(values);
  // Hints only for typed-in invalid values; empty fields just keep «Войти» inactive.
  const idHint =
    values.idInstance !== "" && !isValidIdInstance(values.idInstance);
  const urlHint = values.apiUrl !== "" && !isValidApiUrl(values.apiUrl);
  const version = formatVersion(build);

  function update(patch: Partial<CredentialsForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function toggleCustomApiUrl(customApiUrl: boolean) {
    // Ticking starts from the filled-in value; unticking shows the derived one again.
    update({ customApiUrl, apiUrl: deriveApiUrl(form.idInstance) });
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !submittable) return;
    setCheckedApiUrl(values.apiUrl);
    void signIn(values);
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>GREEN-API WhatsApp Chat</h1>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <fieldset className={styles.fields} disabled={busy}>
            <div className={styles.field}>
              <label htmlFor={idFieldId}>idInstance</label>
              <input
                id={idFieldId}
                className={styles.input}
                value={form.idInstance}
                inputMode="numeric"
                aria-describedby={idHint ? idHintId : undefined}
                onChange={(e) => {
                  update({ idInstance: e.target.value });
                }}
              />
              {idHint && (
                <p id={idHintId} className={styles.hint}>
                  Только цифры, например 7103123456.
                </p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor={tokenFieldId}>apiTokenInstance</label>
              <div className={styles.row}>
                <input
                  id={tokenFieldId}
                  className={styles.input}
                  type={showToken ? "text" : "password"}
                  value={form.apiTokenInstance}
                  autoComplete="off"
                  onChange={(e) => {
                    update({ apiTokenInstance: e.target.value });
                  }}
                />
                <button
                  type="button"
                  className={styles.secondary}
                  aria-pressed={showToken}
                  onClick={() => {
                    setShowToken(!showToken);
                  }}
                >
                  {showToken ? "Скрыть" : "Показать"}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor={urlFieldId}>API URL</label>
              <input
                id={urlFieldId}
                className={styles.input}
                value={shownApiUrl(form)}
                readOnly={!form.customApiUrl}
                inputMode="url"
                aria-describedby={urlHint ? urlHintId : undefined}
                onChange={(e) => {
                  update({ apiUrl: e.target.value });
                }}
              />
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={form.customApiUrl}
                  onChange={(e) => {
                    toggleCustomApiUrl(e.target.checked);
                  }}
                />
                Указать API URL вручную
              </label>
              {urlHint && (
                <p id={urlHintId} className={styles.hint}>
                  Полный адрес, начинающийся с https://
                </p>
              )}
            </div>
          </fieldset>

          {error !== null && (
            <div role="alert" className={styles.error}>
              <p>{checkErrorMessage(error, checkedApiUrl)}</p>
              <button
                type="submit"
                className={styles.secondary}
                disabled={!submittable}
              >
                Проверить снова
              </button>
            </div>
          )}

          <button
            type="submit"
            className={styles.submit}
            disabled={busy || !submittable}
            aria-busy={busy}
          >
            {busy ? "Проверяем…" : "Войти"}
          </button>
        </form>
        <footer className={styles.footer}>
          Version{" "}
          {build.builtAt === null ? (
            <span>{version}</span>
          ) : (
            <time dateTime={build.builtAt}>{version}</time>
          )}
        </footer>
      </div>
    </main>
  );
}
