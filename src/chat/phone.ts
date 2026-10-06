// Pure phone helpers for starting a chat (tech §2.5).

import type { Chat } from "./chats-store";

export interface Country {
  /** The `<select>` value: RU and KZ share the code 7. */
  id: string;
  flag: string;
  name: string;
  /** Digits only; empty for «Другая страна», whose code the user types. */
  code: string;
}

export const COUNTRIES: readonly Country[] = [
  { id: "ru", flag: "🇷🇺", name: "Россия", code: "7" },
  { id: "kz", flag: "🇰🇿", name: "Казахстан", code: "7" },
  { id: "by", flag: "🇧🇾", name: "Беларусь", code: "375" },
  { id: "ua", flag: "🇺🇦", name: "Украина", code: "380" },
  { id: "uz", flag: "🇺🇿", name: "Узбекистан", code: "998" },
  { id: "am", flag: "🇦🇲", name: "Армения", code: "374" },
  { id: "ge", flag: "🇬🇪", name: "Грузия", code: "995" },
  { id: "rs", flag: "🇷🇸", name: "Сербия", code: "381" },
  { id: "tr", flag: "🇹🇷", name: "Турция", code: "90" },
  { id: "de", flag: "🇩🇪", name: "Германия", code: "49" },
  { id: "us", flag: "🇺🇸", name: "США", code: "1" },
  { id: "other", flag: "", name: "Другая страна", code: "" },
];

/** Drops spaces, brackets and dashes. */
export function cleanNumber(value: string): string {
  return value.replace(/[\s()-]/g, "");
}

const DIGITS = /^\d+$/;

/** At least one digit and nothing but digits once cleaned; no length check. */
export function isValidNumber(value: string): boolean {
  return DIGITS.test(cleanNumber(value));
}

/** The «Другая страна» code: digits only, at least one (the `+` is static). */
export function isValidCode(value: string): boolean {
  return DIGITS.test(value);
}

export function toChatId(code: string, number: string): string {
  return `${code}${cleanNumber(number)}@c.us`;
}

/** `+7 903 747-44-11` for 11-digit +7 numbers, `+<digits>` for everything else. */
export function formatTitle(chatId: string): string {
  const digits = chatId.replace(/@c\.us$/, "");
  const ru = /^7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(digits);
  if (ru) return `+7 ${ru[1]} ${ru[2]}-${ru[3]}-${ru[4]}`;
  return `+${digits}`;
}

/** The chat's title: the number, or for a hidden number (`@lid`) the WhatsApp name (tech §2.6). */
export function chatTitle(chat: Pick<Chat, "id" | "title">): string {
  if (chat.id.endsWith("@lid")) return chat.title ?? "Неизвестный номер";
  return formatTitle(chat.id);
}
