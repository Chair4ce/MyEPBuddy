/** True when a PostgREST/fetch error is from AbortController cleanup (not a real failure). */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; message?: string; code?: string };
  if (e.name === "AbortError") return true;
  const msg = e.message ?? "";
  return (
    msg.includes("AbortError") ||
    msg.includes("signal is aborted") ||
    msg.includes("Request was aborted") ||
    msg.includes("aborted without reason")
  );
}

/**
 * Log a Supabase query error unless it is an intentional AbortController cancel.
 * Returns true when the caller should stop (abort or handled log).
 */
export function logUnlessAborted(
  error: unknown,
  label: string,
  signal?: AbortSignal | null,
): boolean {
  if (!error) return false;
  if (signal?.aborted || isAbortError(error)) return true;
  console.error(label, error);
  return true;
}
