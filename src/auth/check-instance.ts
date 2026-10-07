import {
  GreenApiError,
  getSettings,
  getStateInstance,
  type Credentials,
} from "../api/green-api";

export type CheckError =
  | "wrongCredentials"
  | "unreachable"
  | "notAuthorized"
  | "sleepMode"
  | "starting"
  | "blocked"
  | "restricted"
  | "webhookSet"
  | "incomingOff"
  | "unknown";

export function stateError(stateInstance: string): CheckError {
  switch (stateInstance) {
    case "notAuthorized":
    case "sleepMode":
    case "starting":
    case "blocked":
      return stateInstance;
    case "suspended":
    case "yellowCard":
      return "restricted";
    default:
      return "unknown";
  }
}

function failureError(error: unknown): CheckError {
  if (!(error instanceof GreenApiError)) return "unknown";
  if (error.kind === "network") return "unreachable";
  if (error.kind === "http" && (error.status === 401 || error.status === 403)) {
    return "wrongCredentials";
  }
  return "unknown";
}

/** GREEN-API allows about one request per second per method. */
const RETRY_AFTER_429_MS = 1_100;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new GreenApiError("timeout"));
      },
      { once: true },
    );
  });
}

/** Retries a call once after a 429 (TKT-3), inside the same time budget. */
async function withOneRetryOn429<T>(
  call: () => Promise<T>,
  retryDelayMs: number,
  signal: AbortSignal,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof GreenApiError && error.status === 429)) throw error;
    await wait(retryDelayMs, signal);
    return call();
  }
}

/**
 * Lets the user in only when the instance can really send and receive (functional §2.2).
 * Returns null when it can, otherwise the reason. One time budget covers both calls.
 */
export async function checkInstance(
  credentials: Credentials,
  {
    timeoutMs = 15_000,
    retryDelayMs = RETRY_AFTER_429_MS,
  }: { timeoutMs?: number; retryDelayMs?: number } = {},
): Promise<CheckError | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const { signal } = controller;
    const { stateInstance } = await withOneRetryOn429(
      () => getStateInstance(credentials, signal),
      retryDelayMs,
      signal,
    );
    if (stateInstance !== "authorized") return stateError(stateInstance);

    const settings = await withOneRetryOn429(
      () => getSettings(credentials, signal),
      retryDelayMs,
      signal,
    );
    if (settings.webhookUrl.trim() !== "") return "webhookSet";
    if (settings.incomingWebhook !== "yes") return "incomingOff";
    return null;
  } catch (error) {
    return failureError(error);
  } finally {
    clearTimeout(timer);
  }
}
