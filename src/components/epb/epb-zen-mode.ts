import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { useEPBShellStore } from "@/stores/epb-shell-store";

/** Store key used when zen focus is on the duty description card */
export const ZEN_MODE_DUTY_DESCRIPTION_KEY = "duty_description";

/** Marks the card element that currently owns zen focus */
export const EPB_ZEN_FOCUS_ATTR = "data-epb-zen-focus";

/** Marks the MPA description reference panel (stays sharp while editing an MPA) */
export const EPB_ZEN_PANEL_ATTR = "data-epb-zen-panel";

/** Clear zen blur when the user clicks/taps outside the focused card (and panel, if applicable). */
export function handleEpbZenPointerDown(event: ReactPointerEvent<HTMLElement>) {
  const { zenModeMpaKey, mpaDescriptionDrawerOpen, setZenModeMpaKey } =
    useEPBShellStore.getState();
  if (!zenModeMpaKey) return;

  const target = event.target as Node;
  const focusedEl = document.querySelector(`[${EPB_ZEN_FOCUS_ATTR}="${zenModeMpaKey}"]`);
  if (focusedEl?.contains(target)) return;

  if (zenModeMpaKey !== ZEN_MODE_DUTY_DESCRIPTION_KEY && mpaDescriptionDrawerOpen) {
    const panel = document.querySelector(`[${EPB_ZEN_PANEL_ATTR}]`);
    if (panel?.contains(target)) return;
  }

  setZenModeMpaKey(null);
}

/** Subtle blur + darken for non-focused content during zen writing mode */
export const EPB_ZEN_DIMMED =
  "blur-[2px] brightness-[0.78] saturate-[0.88] opacity-85 transition-[filter,opacity] duration-300 ease-out";

/** Elevated, sharp card while user is writing in this MPA */
export const EPB_ZEN_FOCUSED =
  "relative z-20 ring-1 ring-primary/15 shadow-md transition-[box-shadow,filter] duration-300 ease-out";

export function getEpbZenModeClassName(
  zenModeMpaKey: string | null,
  itemKey: string,
  options?: { focusedExtra?: string; dimmedExtra?: string }
) {
  if (!zenModeMpaKey) return undefined;

  const isFocused = zenModeMpaKey === itemKey;
  return cn(
    isFocused
      ? cn(EPB_ZEN_FOCUSED, options?.focusedExtra)
      : cn(EPB_ZEN_DIMMED, options?.dimmedExtra)
  );
}

/** Dim page chrome (headers, toolbars) when any MPA zen mode is active */
export function getEpbZenChromeClassName(zenModeMpaKey: string | null) {
  if (!zenModeMpaKey) return undefined;
  return EPB_ZEN_DIMMED;
}
