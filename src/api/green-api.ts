// Typed GREEN-API client: the sign-in check calls, the WhatsApp check and sending text.
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

  constructor(
    kind: GreenApiErrorKind,
    status: number | null = null,
    invalidNumber = false,
  ) {
    super(status === null ? kind : `${kind} ${String(status)}`);
    this.name = "GreenApiError";
    this.kind = kind;
    this.status = status;
    this.invalidNumber = invalidNumber;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface RequestOptions {
  /** Sent as a JSON POST body; without it the call is a GET. */
  json?: unknown;
  /** Read the body of a 400 to decide `GreenApiError.invalidNumber`. */
  read400?: boolean;
}

// Documented wrong-length text, and the real answer for a short chatId (slice-1 probe).
const INVALID_NUMBER = /Bad phone number|'chatId' must be/;

async function request(
  { idInstance, apiTokenInstance, apiUrl }: Credentials,
  method: string,
  signal: AbortSignal,
  { json, read400 = false }: RequestOptions = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(
      `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}`,
      json === undefined
        ? { signal }
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
    throw new GreenApiError("http", response.status, invalidNumber);
  }
  try {
    return (await response.json()) as unknown;
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
