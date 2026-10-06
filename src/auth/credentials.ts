import type { Credentials } from "../api/green-api";

/** What the sign-in form holds, and what the session saves after a successful check. */
export interface CredentialsForm extends Credentials {
  /** «Указать API URL вручную»: when false, `apiUrl` is ignored and derived from idInstance. */
  customApiUrl: boolean;
}

export const EMPTY_FORM: CredentialsForm = {
  idInstance: "",
  apiTokenInstance: "",
  apiUrl: "",
  customApiUrl: false,
};

/** `7103123456` → `https://7103.api.greenapi.com`; empty until four digits are typed. */
export function deriveApiUrl(idInstance: string): string {
  const prefix = /^\d{4}/.exec(idInstance.trim());
  return prefix ? `https://${prefix[0]}.api.greenapi.com` : "";
}

/** The API URL the form shows: the custom value when ticked, otherwise the derived one. */
export function shownApiUrl(form: CredentialsForm): string {
  return form.customApiUrl ? form.apiUrl : deriveApiUrl(form.idInstance);
}

/** Trims every field and strips the trailing `/` of the API URL; `apiUrl` becomes the shown one. */
export function normalize(form: CredentialsForm): CredentialsForm {
  return {
    idInstance: form.idInstance.trim(),
    apiTokenInstance: form.apiTokenInstance.trim(),
    apiUrl: shownApiUrl(form).trim().replace(/\/+$/, ""),
    customApiUrl: form.customApiUrl,
  };
}

export function isValidIdInstance(value: string): boolean {
  return /^\d+$/.test(value);
}

/** The typed text itself: `https://` + host (+ `:port`) + an optional single `/`. */
const PLAIN_API_URL = /^https:\/\/[^/\\?#@:\s]+(:\d+)?\/?$/;

/** Scheme + host (+ port) only: `https://7103.api.greenapi.com`, no path, `?` or `#`. */
export function isValidApiUrl(value: string): boolean {
  // new URL() forgives `https:host` and resolves `/base/..`, so check the text too.
  if (!PLAIN_API_URL.test(value.trim())) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname !== "" &&
      url.pathname === "/" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

/** Expects a normalized form. */
export function canSubmit(form: CredentialsForm): boolean {
  return (
    isValidIdInstance(form.idInstance) &&
    form.apiTokenInstance !== "" &&
    isValidApiUrl(form.apiUrl)
  );
}
