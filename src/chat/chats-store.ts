import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Credentials } from "../api/green-api";
import type { Incoming } from "./notification";
import { sendText, type SendOutcome } from "./outcomes";
import { pausedBy, useStatus } from "./status-store";

export type MessageStatus = "sending" | "sent" | "failed" | "unknown";

/** A message the user sent (the spec 003 shape). */
export interface Message {
  id: string;
  direction: "out";
  text: string;
  /** Epoch ms. */
  time: number;
  status: MessageStatus;
  idMessage?: string;
}

/** A reply from the contact. */
export interface InMessage {
  id: string;
  direction: "in";
  /** `null` → a type the app can't display yet. */
  text: string | null;
  /** Epoch ms, when it was sent. */
  time: number;
  idMessage: string;
  /** Replies have no status mark. */
  status?: undefined;
}

export type ChatMessage = Message | InMessage;

export interface Chat {
  /** `<digits>@c.us` (or `<digits>@lid` for a hidden number), also the key in `chats`. */
  id: string;
  /** Epoch ms. */
  createdAt: number;
  /** Ordered by `time`. */
  messages: ChatMessage[];
  draft: string;
  /** Replies that arrived while the chat wasn't open; missing (spec 003 data) → 0. */
  unread?: number;
  /** The sender's WhatsApp name, for `@lid` chats. */
  title?: string;
}

export type Chats = Record<string, Chat>;

interface ChatsState {
  /** The signed-in instance; `null` → every action is a no-op (nothing is written). */
  idInstance: string | null;
  chats: Chats;
  selectedId: string | null;
  /** Goes up on every `open` and `wipe`: an answer started in an older session is stale (not persisted). */
  session: number;
  /** Switches to this instance's saved chats. Called by the session store on sign-in. */
  open: (idInstance: string) => void;
  /** Forgets every chat of this instance in this browser. Called by the session store on logout. */
  wipe: () => void;
  /** Adds the chat if it is missing, then selects it (and clears its unread count). */
  addChat: (chatId: string) => void;
  /** Clears the chat's unread count. */
  select: (chatId: string) => void;
  setDraft: (chatId: string, draft: string) => void;
  /**
   * Appends the message as 🕓, clears the draft, then settles it on GREEN-API's answer. A no-op
   * while sending is paused (spec 005 functional §2.6).
   */
  send: (
    credentials: Credentials,
    chatId: string,
    text: string,
  ) => Promise<void>;
  /**
   * Saves a reply (synchronously, so it is persisted when this returns): creates the chat if it is
   * missing, ignores an `idMessage` the chat already has, inserts by time. Throws, keeping nothing,
   * if it can't be saved.
   */
  receive: (incoming: Incoming) => void;
  /** Sends a ❗/❔ message again: the same bubble goes back to 🕓, then settles. Paused like `send`. */
  retry: (
    credentials: Credentials,
    chatId: string,
    messageId: string,
  ) => Promise<void>;
}

const STATUSES: readonly string[] = ["sending", "sent", "failed", "unknown"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMessage(value: unknown): value is ChatMessage {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.time !== "number"
  ) {
    return false;
  }
  if (value.direction === "in") {
    return (
      (typeof value.text === "string" || value.text === null) &&
      typeof value.idMessage === "string" &&
      value.status === undefined
    );
  }
  return (
    value.direction === "out" &&
    typeof value.text === "string" &&
    typeof value.status === "string" &&
    STATUSES.includes(value.status) &&
    (value.idMessage === undefined || typeof value.idMessage === "string")
  );
}

function isChat(id: string, value: unknown): value is Chat {
  return (
    isRecord(value) &&
    value.id === id &&
    typeof value.createdAt === "number" &&
    Array.isArray(value.messages) &&
    value.messages.every(isMessage) &&
    typeof value.draft === "string" &&
    (value.unread === undefined ||
      (typeof value.unread === "number" && value.unread >= 0)) &&
    (value.title === undefined || typeof value.title === "string")
  );
}

/**
 * The saved chats as they come back after a reload: anything malformed → no chats at all, and
 * a message that was still sending when the page closed → `unknown` (functional §2.4).
 */
export function restoreChats(persisted: unknown): Chats {
  const chats = isRecord(persisted) ? persisted.chats : undefined;
  if (!isRecord(chats)) return {};
  const entries = Object.entries(chats);
  if (!entries.every(([id, chat]) => isChat(id, chat))) return {};
  return Object.fromEntries(
    (entries as [string, Chat][]).map(([id, chat]) => [
      id,
      {
        ...chat,
        messages: chat.messages.map((m) =>
          m.direction === "out" && m.status === "sending"
            ? { ...m, status: "unknown" as const }
            : m,
        ),
      },
    ]),
  );
}

/** The last message's time, or when the chat was created. */
export function lastActivity(chat: Chat): number {
  return chat.messages.at(-1)?.time ?? chat.createdAt;
}

/** Newest activity first; on a tie, the chat added later comes first. */
export function sortChats(chats: Chats): Chat[] {
  return Object.values(chats)
    .reverse()
    .sort((a, b) => lastActivity(b) - lastActivity(a));
}

/** Inserts after the last message sent at or before it, so ties keep arrival order. */
function insertByTime(
  messages: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  const at = messages.findLastIndex((m) => m.time <= message.time) + 1;
  return [...messages.slice(0, at), message, ...messages.slice(at)];
}

export const storageKey = (idInstance: string) =>
  `green-api-chat:chats:${idInstance}`;

/** The chats with `chatId`'s unread count cleared; the same object if there was nothing to clear. */
function read(chats: Chats, chatId: string): Chats {
  const chat = chats[chatId];
  return chat.unread ? { ...chats, [chatId]: { ...chat, unread: 0 } } : chats;
}

/** Off only while `open()` forgets the previous instance's chats: that reset must not be saved. */
let saving = true;

export const useChats = create<ChatsState>()(
  persist(
    (set, get, api) => {
      const patchChat = (chatId: string, patch: (chat: Chat) => Chat) => {
        const { idInstance, chats } = get();
        const chat = chats[chatId] as Chat | undefined;
        if (idInstance === null || chat === undefined) return;
        set({ chats: { ...chats, [chatId]: patch(chat) } });
      };

      // A no-op if the message is gone (a logout happened mid-send).
      const settle = (
        chatId: string,
        messageId: string,
        result: SendOutcome,
      ) => {
        patchChat(chatId, (chat) => ({
          ...chat,
          messages: chat.messages.map((m) =>
            m.id !== messageId || m.direction !== "out"
              ? m
              : result.outcome === "sent"
                ? { ...m, status: "sent", idMessage: result.idMessage }
                : { ...m, status: result.outcome },
          ),
        }));
      };

      return {
        idInstance: null,
        chats: {},
        selectedId: null,
        session: 0,

        open: (idInstance) => {
          // A failed rehydrate (unreadable JSON) leaves the state as it is, so forget the previous
          // instance's chats first, without writing them anywhere (review F1).
          saving = false;
          try {
            set({ idInstance: null, chats: {}, selectedId: null });
          } finally {
            saving = true;
          }
          api.persist.setOptions({ name: storageKey(idInstance) });
          // Synchronous for localStorage; `merge` replaces `chats` with what this key holds.
          void api.persist.rehydrate();
          set({ idInstance, selectedId: null, session: get().session + 1 });
        },

        wipe: () => {
          // Every `set` writes, so reset first and remove the key last.
          set({
            idInstance: null,
            chats: {},
            selectedId: null,
            session: get().session + 1,
          });
          api.persist.clearStorage();
        },

        addChat: (chatId) => {
          const { idInstance, chats } = get();
          if (idInstance === null) return;
          set({
            selectedId: chatId,
            chats:
              chatId in chats
                ? read(chats, chatId)
                : {
                    ...chats,
                    [chatId]: {
                      id: chatId,
                      createdAt: Date.now(),
                      messages: [],
                      draft: "",
                    },
                  },
          });
        },

        select: (chatId) => {
          const { idInstance, chats } = get();
          if (idInstance === null || !(chatId in chats)) return;
          set({ selectedId: chatId, chats: read(chats, chatId) });
        },

        receive: ({ chatId, idMessage, time, text, name }) => {
          const { idInstance, chats, selectedId } = get();
          if (idInstance === null) return;
          const chat: Chat =
            chatId in chats
              ? chats[chatId]
              : {
                  id: chatId,
                  createdAt: Date.now(),
                  messages: [],
                  draft: "",
                  unread: 0,
                };
          if (chat.messages.some((m) => m.idMessage === idMessage)) return;
          const message: InMessage = {
            id: crypto.randomUUID(),
            direction: "in",
            text,
            time,
            idMessage,
          };
          try {
            set({
              chats: {
                ...chats,
                [chatId]: {
                  ...chat,
                  messages: insertByTime(chat.messages, message),
                  unread: (chat.unread ?? 0) + (chatId === selectedId ? 0 : 1),
                  ...(chatId.endsWith("@lid") && name !== undefined
                    ? { title: name }
                    : {}),
                },
              },
            });
          } catch (error) {
            // Not saved (a full localStorage): forget it in memory too, or dedupe would skip the
            // redelivery and the delete would follow without a save (review F1).
            saving = false;
            try {
              set({ chats });
            } finally {
              saving = true;
            }
            throw error;
          }
        },

        setDraft: (chatId, draft) => {
          patchChat(chatId, (chat) => ({ ...chat, draft }));
        },

        send: async (credentials, chatId, text) => {
          if (
            get().idInstance === null ||
            !(chatId in get().chats) ||
            pausedBy(useStatus.getState()) !== null
          ) {
            return;
          }
          const message: Message = {
            id: crypto.randomUUID(),
            direction: "out",
            text,
            time: Date.now(),
            status: "sending",
          };
          patchChat(chatId, (chat) => ({
            ...chat,
            draft: "",
            // A reply stamped ahead of the local clock stays after it (review F1).
            messages: insertByTime(chat.messages, message),
          }));
          settle(chatId, message.id, await sendText(credentials, chatId, text));
        },

        retry: async (credentials, chatId, messageId) => {
          const chat = get().chats[chatId] as Chat | undefined;
          const message = chat?.messages.find((m) => m.id === messageId);
          if (
            get().idInstance === null ||
            pausedBy(useStatus.getState()) !== null ||
            message?.direction !== "out" ||
            (message.status !== "failed" && message.status !== "unknown")
          ) {
            return;
          }
          patchChat(chatId, (chat) => ({
            ...chat,
            messages: chat.messages.map((m) =>
              m.id === messageId && m.direction === "out"
                ? { ...m, status: "sending" }
                : m,
            ),
          }));
          settle(
            chatId,
            messageId,
            await sendText(credentials, chatId, message.text),
          );
        },
      };
    },
    {
      // Replaced by `open()` before anything is read or written.
      name: "green-api-chat:chats",
      storage: createJSONStorage(() => ({
        getItem: (name) => localStorage.getItem(name),
        setItem: (name, value) => {
          if (saving) localStorage.setItem(name, value);
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      })),
      version: 1,
      skipHydration: true,
      partialize: ({ chats }) => ({ chats }),
      merge: (persisted, current) => ({
        ...current,
        chats: restoreChats(persisted),
      }),
    },
  ),
);
