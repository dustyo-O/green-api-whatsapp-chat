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
    <main>
      <h1>GREEN-API WhatsApp Chat</h1>
      <form onSubmit={handleSubmit} noValidate>
        <fieldset disabled={busy}>
          <label>
            idInstance
            <input
              value={form.idInstance}
              inputMode="numeric"
              aria-describedby={idHint ? idHintId : undefined}
              onChange={(e) => {
                update({ idInstance: e.target.value });
              }}
            />
          </label>
          {idHint && <p id={idHintId}>Только цифры, например 7103123456.</p>}

          <label>
            apiTokenInstance
            <input
              type={showToken ? "text" : "password"}
              value={form.apiTokenInstance}
              autoComplete="off"
              onChange={(e) => {
                update({ apiTokenInstance: e.target.value });
              }}
            />
          </label>
          <button
            type="button"
            aria-pressed={showToken}
            onClick={() => {
              setShowToken(!showToken);
            }}
          >
            {showToken ? "Скрыть" : "Показать"}
          </button>

          <label>
            API URL
            <input
              value={shownApiUrl(form)}
              readOnly={!form.customApiUrl}
              inputMode="url"
              aria-describedby={urlHint ? urlHintId : undefined}
              onChange={(e) => {
                update({ apiUrl: e.target.value });
              }}
            />
          </label>
          <label>
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
            <p id={urlHintId}>Полный адрес, начинающийся с https://</p>
          )}
        </fieldset>

        {error !== null && (
          <div role="alert">
            <p>{checkErrorMessage(error, checkedApiUrl)}</p>
            <button type="submit" disabled={!submittable}>
              Проверить снова
            </button>
          </div>
        )}

        <button type="submit" disabled={busy || !submittable} aria-busy={busy}>
          {busy ? "Проверяем…" : "Войти"}
        </button>
      </form>
      <footer>
        Version{" "}
        {build.builtAt === null ? (
          <span>{version}</span>
        ) : (
          <time dateTime={build.builtAt}>{version}</time>
        )}
      </footer>
    </main>
  );
}
