/** Minimum length before existing MPA text counts as a real statement (not junk). */
export const SUBSTANTIAL_STATEMENT_MIN_CHARS = 40;

/**
 * True when text looks like a real EPB draft rather than a placeholder,
 * single word, or stray character.
 */
export function isSubstantialEpbStatement(
  text: string | null | undefined
): boolean {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  if (t.length < SUBSTANTIAL_STATEMENT_MIN_CHARS) return false;
  if (!/\s/.test(t)) return false;
  return true;
}

/** Prefer the most common entry MPA among a selection; fallback to executing_mission. */
export function majorityMpa(
  entries: { mpa: string }[],
  validKeys: ReadonlySet<string>
): string {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (!validKeys.has(e.mpa)) continue;
    counts.set(e.mpa, (counts.get(e.mpa) ?? 0) + 1);
  }
  let best = "executing_mission";
  let bestCount = 0;
  for (const [mpa, count] of counts) {
    if (count > bestCount) {
      best = mpa;
      bestCount = count;
    }
  }
  return best;
}
