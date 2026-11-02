/**
 * Copy for a failed generate, revise, or assess call.
 * Prefers the message thrown from the API body. Falls back only when that
 * message is missing.
 */
export function messageFromUnknownError(error: unknown, fallback: string): string {
  if (typeof error === "string") {
    const message = error.trim();
    if (message) return message;
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) return message;
  }
  return fallback;
}
