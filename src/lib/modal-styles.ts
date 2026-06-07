import { cn } from "@/lib/utils";

/** Stacking order for blocking / onboarding modals and their portaled children */
export const MODAL_Z_OVERLAY = "z-[100]";
export const MODAL_Z_CONTENT = "z-[100]";
/** Popovers, selects, and dropdowns rendered inside high-priority modals */
export const MODAL_Z_POPOVER = "z-[110]";

export type ModalSize = "auto" | "sm" | "md" | "lg" | "xl" | "2xl";

const MODAL_WIDTH: Record<Exclude<ModalSize, "auto">, string> = {
  sm: "md:max-w-md",
  md: "md:max-w-lg",
  lg: "md:max-w-2xl",
  xl: "md:max-w-3xl",
  "2xl": "md:max-w-4xl",
};

/** Shared overlay fade — 300ms ease-out */
export const MODAL_OVERLAY_CLASSES =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 bg-black/50 duration-300 ease-out motion-reduce:duration-0";

/** Shared content fade + subtle scale */
export const MODAL_CONTENT_ANIMATION_CLASSES =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-0 motion-reduce:zoom-in-100 motion-reduce:zoom-out-100";

export function modalContentSizeClasses(size: ModalSize = "md"): string {
  if (size === "auto") {
    return "w-auto max-w-[min(100%-1.5rem,100vw)]";
  }
  return cn("w-full max-w-[min(100%-1.5rem,100vw)]", MODAL_WIDTH[size]);
}
