// Turns a GREEN-API notification body into an incoming message, or `null` (delete and skip).
// Pure and total: it never throws, whatever the body (tech §2.3).

export interface Incoming {
  /** `<digits>@c.us`, or `<digits>@lid` when the number is hidden. */
  chatId: string;
  idMessage: string;
  /** Epoch ms. */
  time: number;
  /** `null` → a type the app can't display yet (placeholder). */
  text: string | null;
  /** The sender's WhatsApp name; titles `@lid` chats only. */
  name?: string;
}

// Personal chats only: drops groups `@g.us`, `status@broadcast` and newsletters.
const PERSONAL_CHAT = /^\d+@(c\.us|lid)$/;

// Changes to earlier messages, not replies (functional §3).
const SKIPPED_TYPES: readonly string[] = [
  "reactionMessage",
  "editedMessage",
  "deletedMessage",
  "pollUpdateMessage",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function field(record: unknown, key: string): unknown {
  return isRecord(record) ? record[key] : undefined;
}

const nonEmpty = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/** The text by `typeMessage`, never by whichever field exists (a reaction carries one too). */
function textOf(typeMessage: unknown, messageData: unknown): string | null {
  let text: unknown;
  switch (typeMessage) {
    case "textMessage":
      text = field(field(messageData, "textMessageData"), "textMessage");
      break;
    case "extendedTextMessage":
    case "quotedMessage":
      text = field(field(messageData, "extendedTextMessageData"), "text");
      break;
  }
  return typeof text === "string" ? text : null;
}

export function toIncoming(body: unknown): Incoming | null {
  if (field(body, "typeWebhook") !== "incomingMessageReceived") return null;
  const senderData = field(body, "senderData");
  const chatId = field(senderData, "chatId");
  const idMessage = field(body, "idMessage");
  const timestamp = field(body, "timestamp");
  const messageData = field(body, "messageData");
  const typeMessage = field(messageData, "typeMessage");
  if (
    typeof chatId !== "string" ||
    !PERSONAL_CHAT.test(chatId) ||
    typeof idMessage !== "string" ||
    idMessage === "" ||
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp) ||
    (typeof typeMessage === "string" && SKIPPED_TYPES.includes(typeMessage))
  ) {
    return null;
  }
  const name =
    nonEmpty(field(senderData, "senderName")) ??
    nonEmpty(field(senderData, "senderContactName")) ??
    nonEmpty(field(senderData, "chatName"));
  return {
    chatId,
    idMessage,
    time: timestamp * 1000,
    text: textOf(typeMessage, messageData),
    ...(name === undefined ? {} : { name }),
  };
}
