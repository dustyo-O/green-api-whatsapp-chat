// Typed GREEN-API client: the sign-in check calls, the WhatsApp check, sending text and the
// notification queue.
// The token is part of the URL path (GREEN-API requires it there); it never goes into logs or errors.

export interface Credentials {
  idInstance: string;
  apiTokenInstance: string;
  /** Normalized: scheme + host, no trailing `/`. */
  apiUrl: string;
}

export type GreenApiErrorKind = "network" | "timeout" | "http" | "badBody";

export class GreenApiError extends Error {
  readonly kind: GreenApiErrorKind;
  readonly status: number | null;
  /**
   * A 400 that says the number itself is invalid; decided only when the call asks for it
   * (`checkWhatsapp`). The body is never kept: GREEN-API echoes the token in its `path`.
   */
  readonly invalidNumber: boolean;
  /** A 500 that says the notification is already gone; decided only by `deleteNotification`. */
  readonly notFound: boolean;

  constructor(
    kind: GreenApiErrorKind,
    status: number | null = null,
    invalidNumber = false,
    notFound = false,
  ) {
    super(status === null ? kind : `${kind} ${String(status)}`);
    this.name = "GreenApiError";
    this.kind = kind;
    this.status = status;
    this.invalidNumber = invalidNumber;
    this.notFound = notFound;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface RequestOptions {
  /** Sent as a JSON POST body; without it the call is a GET (or a DELETE, see `del`). */
  json?: unknown;
  /** A DELETE without a body. */
  del?: boolean;
  /** Appended after the token: `?query` or `/<param>`. */
  suffix?: string;
  /** Read the body of a 400 to decide `GreenApiError.invalidNumber`. */
  read400?: boolean;
  /** An empty body (`""`) or `null` is the answer `null`, not `badBody`. */
  allowEmpty?: boolean;
  /** Read the body of a 500 to decide `GreenApiError.notFound`. */
  read500?: boolean;
}

// Documented wrong-length text, and the real answer for a short chatId (slice-1 probe).
const INVALID_NUMBER = /Bad phone number|'chatId' must be/;
// deleteNotification's documented 500 for a receipt that is already gone.
const NOT_FOUND = /findUnAckedMessage/;

async function request(
  { idInstance, apiTokenInstance, apiUrl }: Credentials,
  method: string,
  signal: AbortSignal,
  {
    json,
    del = false,
    suffix = "",
    read400 = false,
    allowEmpty = false,
    read500 = false,
  }: RequestOptions = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(
      `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}${suffix}`,
      json === undefined
        ? { method: del ? "DELETE" : "GET", signal }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(json),
            signal,
          },
    );
  } catch (error) {
    if (signal.aborted) throw new GreenApiError("timeout");
    // Offline, DNS, or a CORS-less answer (e.g. host/instance mismatch) all surface as TypeError.
    if (error instanceof TypeError) throw new GreenApiError("network");
    throw error;
  }
  // Status first: GREEN-API's 401/429 say application/json but have an empty body.
  if (!response.ok) {
    const invalidNumber =
      read400 &&
      response.status === 400 &&
      INVALID_NUMBER.test(await response.text().catch(() => ""));
    const notFound =
      read500 &&
      response.status === 500 &&
      NOT_FOUND.test(await response.text().catch(() => ""));
    throw new GreenApiError("http", response.status, invalidNumber, notFound);
  }
  try {
    const text = await response.text();
    if (allowEmpty && text.trim() === "") return null;
    return JSON.parse(text) as unknown;
  } catch {
    if (signal.aborted) throw new GreenApiError("timeout");
    throw new GreenApiError("badBody");
  }
}

export async function getStateInstance(
  credentials: Credentials,
  signal: AbortSignal,
): Promise<{ stateInstance: string }> {
  const body = await request(credentials, "getStateInstance", signal);
  if (!isRecord(body) || typeof body.stateInstance !== "string") {
    throw new GreenApiError("badBody");
  }
  return { stateInstance: body.stateInstance };
}

export async function getSettings(
  credentials: Credentials,
  signal: AbortSignal,
): Promise<{ webhookUrl: string; incomingWebhook: unknown }> {
  const body = await request(credentials, "getSettings", signal);
  // Strict on purpose (tech §2.2): a missing or non-string webhookUrl is not "no webhook".
  if (
    !isRecord(body) ||
    typeof body.webhookUrl !== "string" ||
    !("incomingWebhook" in body)
  ) {
    throw new GreenApiError("badBody");
  }
  return { webhookUrl: body.webhookUrl, incomingWebhook: body.incomingWebhook };
}

export async function checkWhatsapp(
  credentials: Credentials,
  chatId: string,
  signal: AbortSignal,
): Promise<{ existsWhatsapp: boolean }> {
  const body = await request(credentials, "checkWhatsapp", signal, {
    json: { chatId },
    read400: true,
  });
  if (!isRecord(body) || typeof body.existsWhatsapp !== "boolean") {
    throw new GreenApiError("badBody");
  }
  return { existsWhatsapp: body.existsWhatsapp };
}

export async function sendMessage(
  credentials: Credentials,
  { chatId, message }: { chatId: string; message: string },
  signal: AbortSignal,
): Promise<{ idMessage: string }> {
  const body = await request(credentials, "sendMessage", signal, {
    json: { chatId, message },
  });
  if (
    !isRecord(body) ||
    typeof body.idMessage !== "string" ||
    body.idMessage === ""
  ) {
    throw new GreenApiError("badBody");
  }
  return { idMessage: body.idMessage };
}

export interface Notification {
  receiptId: number;
  body: unknown;
}

/** The head of the notification queue (it stays there until deleted), or `null` if it is empty. */
export async function receiveNotification(
  credentials: Credentials,
  receiveTimeoutS: number,
  signal: AbortSignal,
): Promise<Notification | null> {
  const body = await request(credentials, "receiveNotification", signal, {
    suffix: `?receiveTimeout=${String(receiveTimeoutS)}`,
    allowEmpty: true,
  });
  if (body === null) return null;
  if (!isRecord(body) || typeof body.receiptId !== "number") {
    throw new GreenApiError("badBody");
  }
  return { receiptId: body.receiptId, body: body.body };
}

/**
 * Removes a notification from the queue. Resolves once it is gone: deleted now (`result: true`),
 * or already gone earlier (`result: false`, or the documented 500).
 */
export async function deleteNotification(
  credentials: Credentials,
  receiptId: number,
  signal: AbortSignal,
): Promise<void> {
  let body: unknown;
  try {
    body = await request(credentials, "deleteNotification", signal, {
      del: true,
      suffix: `/${String(receiptId)}`,
      read500: true,
    });
  } catch (error) {
    if (error instanceof GreenApiError && error.notFound) return;
    throw error;
  }
  if (!isRecord(body) || typeof body.result !== "boolean") {
    throw new GreenApiError("badBody");
  }
}
