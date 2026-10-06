import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Credentials } from "../api/green-api";
import { sendText, type SendOutcome } from "./outcomes";

export type MessageStatus = "sending" | "sent" | "failed" | "unknown";

export interface Message {
  id: string;
  direction: "out";
  text: string;
  /** Epoch ms. */
  time: number;
  status: MessageStatus;
  idMessage?: string;
}

export interface Chat {
  /** `<digits>@c.us`, also the key in `chats`. */
  id: string;
  /** Epoch ms. */
  createdAt: number;
  messages: Message[];
  draft: string;
}

export type Chats = Record<string, Chat>;

interface ChatsState {
  /** The signed-in instance; `null` → every action is a no-op (nothing is written). */
  idInstance: string | null;
  chats: Chats;
  selectedId: string | null;
  /** Switches to this instance's saved chats. Called by the session store on sign-in. */
  open: (idInstance: string) => void;
  /** Forgets every chat of this instance in this browser. Called by the session store on logout. */
  wipe: () => void;
  /** Adds the chat if it is missing, then selects it. */
  addChat: (chatId: string) => void;
  select: (chatId: string) => void;
  setDraft: (chatId: string, draft: string) => void;
  /** Appends the message as 🕓, clears the draft, then settles it on GREEN-API's answer. */
  send: (
    credentials: Credentials,
    chatId: string,
    text: string,
  ) => Promise<void>;
  /** Sends a ❗/❔ message again: the same bubble goes back to 🕓, then settles. */
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

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.direction === "out" &&
    typeof value.text === "string" &&
    typeof value.time === "number" &&
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
    typeof value.draft === "string"
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
          m.status === "sending" ? { ...m, status: "unknown" as const } : m,
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

export const storageKey = (idInstance: string) =>
  `green-api-chat:chats:${idInstance}`;

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
            m.id !== messageId
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

        open: (idInstance) => {
          api.persist.setOptions({ name: storageKey(idInstance) });
          // Synchronous for localStorage; `merge` replaces `chats` with what this key holds.
          void api.persist.rehydrate();
          set({ idInstance, selectedId: null });
        },

        wipe: () => {
          // Every `set` writes, so reset first and remove the key last.
          set({ idInstance: null, chats: {}, selectedId: null });
          api.persist.clearStorage();
        },

        addChat: (chatId) => {
          const { idInstance, chats } = get();
          if (idInstance === null) return;
          set({
            selectedId: chatId,
            chats:
              chatId in chats
                ? chats
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
          if (get().idInstance === null || !(chatId in get().chats)) return;
          set({ selectedId: chatId });
        },

        setDraft: (chatId, draft) => {
          patchChat(chatId, (chat) => ({ ...chat, draft }));
        },

        send: async (credentials, chatId, text) => {
          if (get().idInstance === null || !(chatId in get().chats)) return;
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
            messages: [...chat.messages, message],
          }));
          settle(chatId, message.id, await sendText(credentials, chatId, text));
        },

        retry: async (credentials, chatId, messageId) => {
          const chat = get().chats[chatId] as Chat | undefined;
          const message = chat?.messages.find((m) => m.id === messageId);
          if (
            get().idInstance === null ||
            message === undefined ||
            (message.status !== "failed" && message.status !== "unknown")
          ) {
            return;
          }
          patchChat(chatId, (chat) => ({
            ...chat,
            messages: chat.messages.map((m) =>
              m.id === messageId ? { ...m, status: "sending" } : m,
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
