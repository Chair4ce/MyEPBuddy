/**
 * Shared Tailwind class fragments for the house motion system.
 * Compose with `cn()` alongside layout/state classes — no one-off curves,
 * durations, or shadow stacks in feature code.
 *
 * Backing CSS lives in `src/app/globals.css`; token values are mirrored in
 * `./tokens`.
 */

/**
 * Firm 0.98 press on buttons, toggles, tabs, menu rows.
 *
 * `t-press` owns only the `:active` transform; the timing rides on the
 * Tailwind utilities below. When an element also needs color/shadow
 * transitions, reach for `motionChip` / `motionListRow` /
 * `motionTransitionInteractive` instead of composing two transition
 * utilities — `cn()` keeps only the last `transition-*` in a conflict.
 */
export const motionPressable =
  "t-press transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth)] motion-reduce:transition-none";

/**
 * Press transform with no transition of its own — for elements that already
 * declare one, notably shadcn `<Button>` (its base variant carries
 * `transition-all`). Adding `motionPressable` there would let `cn()` drop the
 * button's own transition and kill its hover tint.
 */
export const motionPressOnly = "t-press";

/** Interactive surface transition — transform, color, shadow. */
export const motionTransitionInteractive =
  "transition-[transform,color,background-color,opacity,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-smooth)] motion-reduce:transition-none";

/** Color-only transition (hover tint, active tab, icon color). */
export const motionTransitionColors =
  "transition-[color,background-color,border-color] duration-[var(--duration-fast)] ease-[var(--ease-smooth)] motion-reduce:transition-none";

/** Everyday panel on a surface — layered light, not a border. */
export const motionSurfaceCard = "t-shadow-card";

/** Modals, popovers, menus. */
export const motionSurfaceElevated = "t-shadow-elevated";

/** Clickable list / menu row. */
export const motionListRow =
  "t-press transition-[transform,color,background-color,opacity,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-smooth)] motion-reduce:transition-none";

/** Compact chip / filter pill / segmented control button. */
export const motionChip =
  "t-press transition-[transform,color,background-color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-smooth)] motion-reduce:transition-none";

/** Text fields — focus ring, border, and shadow transitions. */
export const motionInputFocus =
  "transition-[color,box-shadow,border-color] duration-[var(--duration-fast)] ease-[var(--ease-smooth)] motion-reduce:transition-none";

/** Chevron / caret rotation when a panel opens — snappy strong ease-out. */
export const motionChevronOpen =
  "transition-transform duration-[var(--chevron-dur)] ease-[var(--chevron-ease)] motion-reduce:transition-none";

/**
 * Grid-row expand/collapse (`0fr → 1fr`). Toggle `data-open="true" | "false"`
 * on the same element; the child wrapper handles overflow.
 */
export const motionCollapseGrid = "t-collapse-grid";

/** Progress / width indicators driven by transform. */
export const motionProgressIndicator =
  "transition-[transform,width] duration-[var(--duration-normal)] ease-[var(--ease-smooth)] motion-reduce:transition-none";

/** Link hover color only. */
export const motionLinkHover =
  "transition-[color] duration-[var(--duration-fast)] ease-[var(--ease-smooth)] motion-reduce:transition-none";

/** Blur + rise content entrance (default panel / section reveal). */
export const motionEnter = "t-enter motion-reduce:animate-none";

/** Opacity-only entrance — inline status, no layout shift. */
export const motionEnterFade = "t-enter-fade motion-reduce:animate-none";

export const motionEnterFromTop = "t-enter-from-top motion-reduce:animate-none";
export const motionEnterFromRight = "t-enter-from-right motion-reduce:animate-none";
export const motionEnterFromLeft = "t-enter-from-left motion-reduce:animate-none";
export const motionEnterFromBottom = "t-enter-from-bottom motion-reduce:animate-none";

/** Success checkmarks / confirmation pop. */
export const motionEnterZoom = "t-enter-zoom motion-reduce:animate-none";
export const motionEnterZoomSm = "t-enter-zoom-sm motion-reduce:animate-none";

/** Duration modifiers — compose with the entrances above. */
export const motionEnterDurFast = "t-enter-dur-fast";
export const motionEnterDurNormal = "t-enter-dur-normal";
export const motionEnterDurSlow = "t-enter-dur-slow";
/** List / tab rows — 240ms house budget (`--list-enter-dur`). */
export const motionEnterDurList = "t-enter-dur-list";

/**
 * Stagger delay for list entrances. Pair with `motionEnter` +
 * `motionEnterDurList`. Use only on first paint / newly added rows — not on
 * every filter re-render.
 *
 * @param index - Zero-based row index in the mounted list
 */
export function motionListEnterStagger(index: number): {
  animationDelay: string;
} {
  return {
    animationDelay: `calc(${index} * var(--list-enter-stagger))`,
  };
}
