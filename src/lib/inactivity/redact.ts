const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Drop addresses and cap length before a provider error is stored or logged. */
export function redactInactivityError(value: string): string {
  return value.replace(EMAIL_PATTERN, "[redacted]").slice(0, 500);
}
