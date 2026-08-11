import { flushSync } from "react-dom";

/** Matches split-view inner close animation and transitions.dev card resize */
export const EPB_RESIZE_MS = 300;

export const EPB_SPLIT_INNER_CLOSE_MS = 300;

function runEpbHeightTween(
  shell: HTMLDivElement,
  startHeight: number,
  endHeight: number,
  onComplete?: () => void
) {
  if (startHeight === endHeight) {
    shell.style.height = "";
    shell.style.overflow = "";
    shell.classList.remove("epb-t-resize");
    onComplete?.();
    return;
  }

  shell.style.height = `${startHeight}px`;
  shell.style.overflow = "hidden";
  shell.classList.add("epb-t-resize");

  requestAnimationFrame(() => {
    shell.style.height = `${endHeight}px`;

    window.setTimeout(() => {
      shell.style.height = "";
      shell.style.overflow = "";
      shell.classList.remove("epb-t-resize");
      onComplete?.();
    }, EPB_RESIZE_MS);
  });
}

/**
 * Smoothly resizes a shell element when its child content swaps (e.g. split ↔ combined).
 * Uses explicit height tweening; requires `.epb-t-resize` in globals.css.
 *
 * Locks height + overflow *before* the DOM swap so new content never paints at full
 * natural height then snaps back (that flash/jerk was visible on generate/revise).
 */
export function animateEpbShellResize(
  shell: HTMLDivElement | null,
  onSwap: () => void,
  onComplete?: () => void
) {
  if (!shell) {
    onSwap();
    onComplete?.();
    return;
  }

  const startHeight = shell.offsetHeight;
  shell.style.height = `${startHeight}px`;
  shell.style.overflow = "hidden";

  flushSync(onSwap);

  // Double rAF so nested panels (e.g. generated revisions) finish layout before measuring
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const endHeight = shell.scrollHeight;
      runEpbHeightTween(shell, startHeight, endHeight, onComplete);
    });
  });
}

/**
 * Smoothly resizes after an async state update (e.g. AI mode toggle with lock acquisition).
 */
export async function animateEpbShellResizeAfter(
  shell: HTMLDivElement | null,
  update: () => void | Promise<void>,
  onComplete?: () => void
) {
  if (!shell) {
    await update();
    onComplete?.();
    return;
  }

  const startHeight = shell.offsetHeight;
  shell.style.height = `${startHeight}px`;
  shell.style.overflow = "hidden";
  await update();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const endHeight = shell.scrollHeight;
      runEpbHeightTween(shell, startHeight, endHeight, onComplete);
    });
  });
}
