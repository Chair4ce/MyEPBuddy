/** One-time "New" highlight for Impact Booster — client localStorage only. */

const STORAGE_KEY = "epb_impact_booster_intro_seen";

export function hasSeenImpactBoosterIntro(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

export function markImpactBoosterIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // ignore quota / private mode
  }
}
