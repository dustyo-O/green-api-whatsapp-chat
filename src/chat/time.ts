/** `HH:MM` in the browser's time zone. */
export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
