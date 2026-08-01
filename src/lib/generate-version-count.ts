/**
 * Clamp alternative statement version count for POST /api/generate.
 * One billable credit covers the whole request regardless of this value.
 */
export function clampGenerateVersionCount(raw: unknown): number {
  return Math.min(3, Math.max(1, Math.floor(Number(raw) || 1)));
}
