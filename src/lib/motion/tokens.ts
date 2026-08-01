/**
 * House motion tokens — mirror of the `:root` vars in `src/app/globals.css`.
 * Use in JS-driven motion (springs, measured resize) where CSS variables
 * aren't reachable. Keep both sides in sync; `motion-tokens.test.ts` asserts
 * the documented curve/duration table.
 */

export const EASE_SMOOTH = "cubic-bezier(0.22, 1, 0.36, 1)" as const;
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)" as const;
/** Strong ease-out for chevrons / snappy UI feedback. */
export const EASE_OUT_STRONG = "cubic-bezier(0.23, 1, 0.32, 1)" as const;
export const EASE_SPRING = "cubic-bezier(0.34, 1.45, 0.64, 1)" as const;
export const EASE_CLOSE = "cubic-bezier(0.4, 0, 0.2, 1)" as const;

export const DURATION_FAST_MS = 150;
export const DURATION_NORMAL_MS = 200;
export const DURATION_SLOW_MS = 280;

/** List / tab panel entrances — frequent UI stays under 300ms. */
export const LIST_ENTER_DUR_MS = 240;
export const LIST_ENTER_STAGGER_MS = 40;

/** Chevron / caret rotation. */
export const CHEVRON_DUR_MS = 160;

export const REVEAL_RISE_PX = 6;
export const REVEAL_BLUR_PX = 2;

/** MyEPBuddy press scale — firm, never a collapse. */
export const PRESS_SCALE = 0.98;
