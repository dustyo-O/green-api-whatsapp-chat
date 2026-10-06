import type { CheckError } from "./check-instance";

// Functional §2.2, verbatim.
const MESSAGES: Record<Exclude<CheckError, "unreachable">, string> = {
  wrongCredentials: "Неверный idInstance или apiTokenInstance.",
  notAuthorized:
    "Инстанс не авторизован. Отсканируйте QR-код в консоли GREEN-API.",
  sleepMode: "Телефон с WhatsApp не в сети. Включите его и проверьте снова.",
  starting: "Инстанс запускается. Попробуйте через минуту.",
  blocked: "Инстанс заблокирован. Проверьте его в консоли GREEN-API.",
  restricted:
    "Работа инстанса временно ограничена. Проверьте его в консоли GREEN-API.",
  webhookSet:
    "Входящие сообщения уходят на webhook. Очистите поле Webhook URL в настройках инстанса в консоли GREEN-API.",
  incomingOff:
    "Уведомления о входящих сообщениях выключены. Включите их в настройках инстанса в консоли GREEN-API.",
  unknown: "Не удалось проверить инстанс. Попробуйте ещё раз.",
};

export function checkErrorMessage(error: CheckError, apiUrl: string): string {
  if (error === "unreachable") {
    return `Не удалось связаться с ${apiUrl}. Проверьте API URL в консоли GREEN-API и подключение к интернету.`;
  }
  return MESSAGES[error];
}
