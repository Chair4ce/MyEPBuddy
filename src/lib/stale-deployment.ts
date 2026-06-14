export const STALE_DEPLOYMENT_EVENT = "app:stale-deployment";

const STALE_SERVER_ACTION_PATTERNS = [
  "Failed to find Server Action",
  "older or newer deployment",
] as const;

export function isStaleServerActionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!message) return false;

  return STALE_SERVER_ACTION_PATTERNS.some((pattern) =>
    message.includes(pattern)
  );
}

export function signalStaleDeployment(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STALE_DEPLOYMENT_EVENT));
}

/**
 * Call from catch blocks around server actions. Returns true when the error
 * is a stale-deployment mismatch and the update prompt was triggered.
 */
export function handleStaleDeploymentError(error: unknown): boolean {
  if (!isStaleServerActionError(error)) return false;
  signalStaleDeployment();
  return true;
}
