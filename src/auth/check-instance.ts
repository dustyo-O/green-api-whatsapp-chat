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

function stateError(stateInstance: string): CheckError {
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

/**
 * Lets the user in only when the instance can really send and receive (functional §2.2).
 * Returns null when it can, otherwise the reason. One time budget covers both calls.
 */
export async function checkInstance(
  credentials: Credentials,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<CheckError | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const { stateInstance } = await getStateInstance(
      credentials,
      controller.signal,
    );
    if (stateInstance !== "authorized") return stateError(stateInstance);

    const settings = await getSettings(credentials, controller.signal);
    if (settings.webhookUrl.trim() !== "") return "webhookSet";
    if (settings.incomingWebhook !== "yes") return "incomingOff";
    return null;
  } catch (error) {
    return failureError(error);
  } finally {
    clearTimeout(timer);
  }
}
