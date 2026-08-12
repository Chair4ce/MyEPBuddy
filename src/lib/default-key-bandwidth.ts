/**
 * Fair-share helper mirroring consume_credit's default-key bandwidth logic.
 * Pure math so we can unit-test without Postgres.
 */

export function defaultKeyFairCap(capacityRpm: number, activeUsers: number): number {
  const capacity = Math.max(5, Math.floor(capacityRpm));
  const active = Math.max(1, Math.floor(activeUsers));
  return Math.max(1, Math.ceil(capacity / active));
}

/**
 * Whether a user should be denied under fair-share (before the token bucket).
 * Alone users are never denied by fair share — only by an empty token bucket.
 */
export function isDefaultKeyFairShareDenied(params: {
  capacityRpm: number;
  otherActiveUsers: number;
  userRecentInWindow: number;
}): boolean {
  const active = Math.max(0, params.otherActiveUsers) + 1;
  if (active <= 1) return false;
  const fairCap = defaultKeyFairCap(params.capacityRpm, active);
  return params.userRecentInWindow >= fairCap;
}
