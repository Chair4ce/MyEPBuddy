/**
 * Client-side optimistic pacing for billable AI actions.
 *
 * Server truth:
 * - Default key: global token bucket (`epb_config.default_key_rpm`, default 60)
 *   with fair share when multiple users are active.
 * - BYOK: hard per-user 5 / 60s in `check_and_record_usage`.
 *
 * Client pacing is best-effort; 429 `burst_rate_limited` remains authoritative.
 */
export const BYOK_BURST_LIMIT = 5;
/** Slightly under default RPM so alone default-key users leave a little headroom. */
export const DEFAULT_KEY_CLIENT_BURST_LIMIT = 50;
/** @deprecated Prefer DEFAULT_KEY_CLIENT_BURST_LIMIT or BYOK_BURST_LIMIT. */
export const BILLABLE_BURST_LIMIT = DEFAULT_KEY_CLIENT_BURST_LIMIT;
export const BILLABLE_BURST_WINDOW_MS = 60_000;
/** Extra wait past the exact window edge to avoid race with server clock. */
export const BILLABLE_BURST_BUFFER_MS = 1500;

/** Suggested delay between sequential default-key billable calls when alone. */
export const DEFAULT_KEY_PACING_MS = Math.ceil(
  BILLABLE_BURST_WINDOW_MS / DEFAULT_KEY_CLIENT_BURST_LIMIT,
);

/**
 * How long to wait before another billable action is safe under the burst cap.
 * `recentActionAt` should be timestamps of actions that already consumed a slot.
 */
export function msUntilBurstSlot(
  recentActionAt: readonly number[],
  now = Date.now(),
  limit = DEFAULT_KEY_CLIENT_BURST_LIMIT,
  windowMs = BILLABLE_BURST_WINDOW_MS,
): number {
  const cutoff = now - windowMs;
  const inWindow = recentActionAt
    .filter((t) => t > cutoff)
    .sort((a, b) => a - b);

  if (inWindow.length < limit) return 0;

  const oldestBlocking = inWindow[inWindow.length - limit]!;
  return Math.max(0, oldestBlocking + windowMs - now);
}

export function recordBurstAction(
  recentActionAt: readonly number[],
  at = Date.now(),
  windowMs = BILLABLE_BURST_WINDOW_MS,
): number[] {
  const cutoff = at - windowMs;
  return [...recentActionAt.filter((t) => t > cutoff), at];
}

export async function waitForBurstSlot(
  recentActionAt: readonly number[],
  options?: {
    now?: number;
    limit?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<void> {
  const now = options?.now ?? Date.now();
  const limit = options?.limit ?? DEFAULT_KEY_CLIENT_BURST_LIMIT;
  const sleepFn =
    options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const waitMs = msUntilBurstSlot(recentActionAt, now, limit);
  if (waitMs > 0) {
    await sleepFn(waitMs + BILLABLE_BURST_BUFFER_MS);
  }
}
