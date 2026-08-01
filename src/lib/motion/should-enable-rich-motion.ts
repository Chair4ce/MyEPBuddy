/**
 * Whether rich / continuous motion (decorative loops, heavy blur entrances)
 * should run on this device. Constrained devices keep static layout and
 * typography only.
 *
 * List entrances also drop blur under `(hover: none) and (pointer: coarse)`
 * via CSS in `src/app/globals.css` — independent of this JS gate.
 */

interface NavigatorWithDeviceHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/** Device RAM is at or below ~4 GB (Chrome/Edge expose `deviceMemory`). */
export function hasLowDeviceMemory(): boolean {
  if (typeof navigator === "undefined") return false;
  const memoryGb = (navigator as NavigatorWithDeviceHints).deviceMemory;
  return typeof memoryGb === "number" && memoryGb <= 4;
}

/** User or carrier requested reduced data usage. */
export function prefersSaveData(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as NavigatorWithDeviceHints).connection?.saveData === true;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True when decorative or continuous motion may run. */
export function shouldEnableRichMotion(): boolean {
  if (prefersReducedMotion()) return false;
  if (prefersSaveData()) return false;
  if (hasLowDeviceMemory()) return false;
  return true;
}
