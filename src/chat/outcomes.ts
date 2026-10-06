import {
  GreenApiError,
  checkWhatsapp,
  sendMessage,
  type Credentials,
} from "../api/green-api";

export type CheckOutcome =
  "exists" | "notOnWhatsapp" | "invalidNumber" | "checkFailed";

export type SendOutcome =
  { outcome: "sent"; idMessage: string } | { outcome: "failed" | "unknown" };

interface Budget {
  timeoutMs?: number;
}

/** Runs `call` with a signal that aborts after `timeoutMs`. */
async function withBudget<T>(
  timeoutMs: number,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await call(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Asks GREEN-API whether `chatId` uses WhatsApp (tech §2.2, first table). */
export async function checkNumber(
  credentials: Credentials,
  chatId: string,
  { timeoutMs = 15_000 }: Budget = {},
): Promise<CheckOutcome> {
  try {
    const { existsWhatsapp } = await withBudget(timeoutMs, (signal) =>
      checkWhatsapp(credentials, chatId, signal),
    );
    return existsWhatsapp ? "exists" : "notOnWhatsapp";
  } catch (error) {
    if (error instanceof GreenApiError && error.invalidNumber) {
      return "invalidNumber";
    }
    return "checkFailed";
  }
}

/**
 * Sends `text` as is (tech §2.2, second table). A 4xx means GREEN-API answered and refused;
 * anything else that isn't a clean 200 may still have been queued, so it is `unknown`.
 */
export async function sendText(
  credentials: Credentials,
  chatId: string,
  text: string,
  { timeoutMs = 15_000 }: Budget = {},
): Promise<SendOutcome> {
  try {
    const { idMessage } = await withBudget(timeoutMs, (signal) =>
      sendMessage(credentials, { chatId, message: text }, signal),
    );
    return { outcome: "sent", idMessage };
  } catch (error) {
    if (
      error instanceof GreenApiError &&
      error.status !== null &&
      error.status >= 400 &&
      error.status < 500
    ) {
      return { outcome: "failed" };
    }
    return { outcome: "unknown" };
  }
}
