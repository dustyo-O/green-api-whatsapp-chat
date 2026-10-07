// @layer: unit
// @spec: 004-receiving-replies
import { describe, expect, it } from "vitest";
import {
  CONTACT,
  TIMESTAMP,
  extendedTextMessage,
  groupMessage,
  lidWithName,
  lidWithoutName,
  outgoingAPIMessageReceived,
  outgoingMessageReceived,
  outgoingMessageStatus,
  quotedMessage,
  reactionMessage,
  stickerMessage,
  textBody,
  textMessage,
  webhook,
} from "./notification.fixtures";
import { toIncoming } from "./notification";

const ID = "F7AEC1B7086ECDC7E6E45923F5EDB825";
const TIME = TIMESTAMP * 1000;

describe("toIncoming", () => {
  // @regression — functional §2.1, §2.3: text replies, placeholders, @lid titles
  it.each([
    ["a text message", textMessage, "Привет-привет", CONTACT],
    [
      "an extended text message",
      extendedTextMessage,
      "https://www.youtube.com/watch?v=xxxxxxxxxxx",
      CONTACT,
    ],
    ["a quoted reply, as its own text", quotedMessage, "Да, помню", CONTACT],
    ["a sticker, as a placeholder", stickerMessage, null, CONTACT],
    ["an @lid sender", lidWithName, "Привет", "155508384256027@lid"],
  ])("keeps %s", (_, body, text, chatId) => {
    expect(toIncoming(body)).toEqual({
      chatId,
      idMessage: ID,
      time: TIME,
      text,
      name: "Иван",
    });
  });

  it("gives no name when the sender has none", () => {
    expect(toIncoming(lidWithoutName)).toEqual({
      chatId: "155508384256028@lid",
      idMessage: ID,
      time: TIME,
      text: "Привет",
    });
  });

  it("takes the first non-empty name: sender, contact, chat", () => {
    const named = (senderData: Record<string, unknown>) =>
      toIncoming(textBody("Привет", { senderData }))?.name;

    expect(named({ senderName: " ", senderContactName: "Ваня" })).toBe("Ваня");
    expect(
      named({ senderName: "", senderContactName: "", chatName: "Иван И." }),
    ).toBe("Иван И.");
  });

  it.each([
    ["a text message without its text", { typeMessage: "textMessage" }],
    [
      "an extended text message without its text",
      { typeMessage: "extendedTextMessage", extendedTextMessageData: {} },
    ],
    ["an unknown type", { typeMessage: "somethingNew" }],
    ["no typeMessage", {}],
  ])("turns %s into a placeholder", (_, messageData) => {
    expect(toIncoming(webhook(messageData))?.text).toBeNull();
  });

  // @regression — functional §2.3, §3: never shown; tech §2.3 the reaction trap
  it.each([
    ["a group message", groupMessage],
    ["a message typed on the instance's phone", outgoingMessageReceived],
    ["our own API message echoed back", outgoingAPIMessageReceived],
    ["a status", outgoingMessageStatus],
    ["a reaction, despite its text", reactionMessage],
    ["an edit", webhook({ typeMessage: "editedMessage" })],
    ["a deletion", webhook({ typeMessage: "deletedMessage" })],
    ["a poll vote", webhook({ typeMessage: "pollUpdateMessage" })],
    ["status@broadcast", textBody("x", { chatId: "status@broadcast" })],
    ["a newsletter", textBody("x", { chatId: "120363@newsletter" })],
    ["no idMessage", textBody("x", { idMessage: "" })],
    ["a string timestamp", textBody("x", { timestamp: "1" as never })],
    // review F2 (pr #12): Infinity ms is saved as `null` and wipes every chat on reload
    ["a timestamp too big for a Date", textBody("x", { timestamp: 1e308 })],
    [
      "a timestamp past the Date range",
      textBody("x", { timestamp: 8.64e12 + 1 }),
    ],
    ["no senderData", { ...textMessage, senderData: undefined }],
  ])("skips %s", (_, body) => {
    expect(toIncoming(body)).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "incomingMessageReceived"],
    ["an array", [textMessage]],
    ["a number", 7],
  ])("skips %s without throwing", (_, body) => {
    expect(toIncoming(body)).toBeNull();
  });
});
