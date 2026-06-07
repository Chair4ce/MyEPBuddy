import { useSyncExternalStore } from "react";

function subscribeClientReady() {
  return () => undefined;
}

/** True only after client hydration — avoids SSR/client snapshot mismatches for onboarding gates. */
export function useClientReady(): boolean {
  return useSyncExternalStore(
    subscribeClientReady,
    () => true,
    () => false
  );
}
