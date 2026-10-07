// Notification bodies built from the GREEN-API doc examples (tech §4); fake ids and numbers only.

/** The contact from the functional spec, `+7 903 747-44-11`. */
export const CONTACT = "79037474411@c.us";
/** 2025-10-06 16:00:00 UTC, in seconds like GREEN-API's `timestamp`. */
export const TIMESTAMP = 1_759_766_400;

interface Options {
  chatId?: string;
  idMessage?: string;
  timestamp?: number;
  typeWebhook?: string;
  senderData?: Record<string, unknown>;
}

/** An `incomingMessageReceived` body (or another `typeWebhook`) with this `messageData`. */
export function webhook(
  messageData: Record<string, unknown>,
  {
    chatId = CONTACT,
    idMessage = "F7AEC1B7086ECDC7E6E45923F5EDB825",
    timestamp = TIMESTAMP,
    typeWebhook = "incomingMessageReceived",
    senderData = {},
  }: Options = {},
) {
  return {
    typeWebhook,
    instanceData: {
      idInstance: 7103000001,
      wid: "79000000000@c.us",
      typeInstance: "whatsapp",
    },
    timestamp,
    idMessage,
    senderData: {
      chatId,
      chatName: "Иван",
      sender: chatId,
      senderName: "Иван",
      senderContactName: "",
      ...senderData,
    },
    messageData,
  };
}

/** A plain text reply. */
export const textBody = (text: string, options?: Options) =>
  webhook(
    { typeMessage: "textMessage", textMessageData: { textMessage: text } },
    options,
  );

export const textMessage = textBody("Привет-привет");

export const extendedTextMessage = webhook({
  typeMessage: "extendedTextMessage",
  extendedTextMessageData: {
    text: "https://www.youtube.com/watch?v=xxxxxxxxxxx",
    description: "",
    title: "",
    previewType: "None",
    jpegThumbnail: "",
    forwardingScore: 0,
    isForwarded: false,
  },
});

/** A reply that quotes an earlier message: the text is below the quote. */
export const quotedMessage = webhook({
  typeMessage: "quotedMessage",
  extendedTextMessageData: {
    text: "Да, помню",
    stanzaId: "BAE5F4886F6F2D05",
    participant: "79000000000@c.us",
  },
  quotedMessage: {
    stanzaId: "BAE5F4886F6F2D05",
    participant: "79000000000@c.us",
    typeMessage: "textMessage",
    textMessage: "Помнишь?",
  },
});

export const stickerMessage = webhook({
  typeMessage: "stickerMessage",
  fileMessageData: {
    downloadUrl: "https://sw-media-out.example.invalid/sticker.webp",
    caption: "",
    fileName: "sticker.webp",
    jpegThumbnail: "",
    mimeType: "image/webp",
    isAnimated: false,
  },
});

/** Lid mode: no number anywhere, the WhatsApp name only. */
export const lidWithName = textBody("Привет", {
  chatId: "155508384256027@lid",
  senderData: { senderName: "Иван", senderContactName: "", chatName: "" },
});

export const lidWithoutName = textBody("Привет", {
  chatId: "155508384256028@lid",
  senderData: { senderName: "", senderContactName: "", chatName: "" },
});

export const groupMessage = textBody("Всем привет", {
  chatId: "120363369140947676@g.us",
  senderData: { sender: CONTACT, chatName: "Группа" },
});

/** Typed on the instance account's own phone. */
export const outgoingMessageReceived = textBody("С телефона", {
  typeWebhook: "outgoingMessageReceived",
});

/** Our own `sendMessage`, echoed back. */
export const outgoingAPIMessageReceived = textBody("Привет", {
  typeWebhook: "outgoingAPIMessageReceived",
});

export const outgoingMessageStatus = {
  typeWebhook: "outgoingMessageStatus",
  chatId: CONTACT,
  instanceData: {
    idInstance: 7103000001,
    wid: "79000000000@c.us",
    typeInstance: "whatsapp",
  },
  timestamp: TIMESTAMP,
  idMessage: "BAE5F4886F6F2D05",
  status: "read",
  sendByApi: true,
};

/** The trap: it carries `extendedTextMessageData.text` too. */
export const reactionMessage = webhook({
  typeMessage: "reactionMessage",
  extendedTextMessageData: { text: "👍" },
  quotedMessage: {
    stanzaId: "BAE5F4886F6F2D05",
    participant: "79000000000@c.us",
    typeMessage: "reactionMessage",
  },
});
