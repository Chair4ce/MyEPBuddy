import { useSyncExternalStore } from "react";

const RANK_MODAL_DISMISSED_EVENT = "rank-modal-dismissed";

export const getRankModalStorageKey = (userId: string) =>
  `rank_modal_dismissed_${userId}`;

function subscribeRankModalDismissed(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(RANK_MODAL_DISMISSED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(RANK_MODAL_DISMISSED_EVENT, onStoreChange);
  };
}

function getRankModalDismissedSnapshot(userId: string | undefined): boolean {
  if (!userId || typeof window === "undefined") {
    return true;
  }
  return localStorage.getItem(getRankModalStorageKey(userId)) === "true";
}

export function markRankModalDismissed(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getRankModalStorageKey(userId), "true");
  window.dispatchEvent(new Event(RANK_MODAL_DISMISSED_EVENT));
}

export function useRankModalDismissed(userId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribeRankModalDismissed,
    () => getRankModalDismissedSnapshot(userId),
    () => false
  );
}
