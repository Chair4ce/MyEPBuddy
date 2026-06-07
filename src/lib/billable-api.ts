import { useCreditsStore } from "@/stores/credits-store";

/** POST endpoints that consume a prepaid AI call (default-key users). */
export const BILLABLE_API_PATHS = [
  "/api/generate",
  "/api/revise-selection",
  "/api/generate-war",
  "/api/generate-award",
  "/api/generate-decoration",
  "/api/generate-slot-statement",
  "/api/assess-epb",
  "/api/assess-accomplishment",
  "/api/assess-accomplishment-preview",
  "/api/parse-bulk-statements",
  "/api/adapt-sentence",
  "/api/synonyms",
  "/api/combine",
  "/api/combine-statements",
  "/api/convert-sentences",
  "/api/feedback/apply",
] as const;

function normalizePath(url: string): string {
  if (url.startsWith("http")) {
    return new URL(url).pathname;
  }
  return url.split("?")[0] ?? url;
}

export function isBillableApiRequest(url: string, method?: string): boolean {
  if (!method || method.toUpperCase() !== "POST") return false;
  const pathname = normalizePath(url);
  return BILLABLE_API_PATHS.some((path) => pathname === path);
}

/** Instant sidebar decrement before the request completes. */
export function maybeOptimisticConsume(url: string, method?: string): void {
  if (isBillableApiRequest(url, method)) {
    useCreditsStore.getState().applyOptimisticConsume();
  }
}

/** Re-fetch balance when a billable request fails before credits were consumed. */
export async function reconcileCreditsAfterFailure(
  url: string,
  method: string | undefined,
  response: Response,
): Promise<void> {
  if (!isBillableApiRequest(url, method)) return;

  if (response.status === 402 || response.status === 403) {
    void useCreditsStore.getState().fetchCredits();
    return;
  }

  if (!response.ok) {
    void useCreditsStore.getState().fetchCredits();
  }
}
