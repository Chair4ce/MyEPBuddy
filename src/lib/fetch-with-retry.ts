/**
 * Resilient Fetch Utility
 *
 * Provides fetch with:
 * - Automatic retry with exponential backoff for transient network errors
 * - AbortController timeout to prevent indefinite hangs
 * - Safe error classification (retryable vs non-retryable)
 */

interface FetchWithRetryOptions {
  /** Maximum number of retry attempts (default: 2, so 3 total attempts) */
  maxRetries?: number;
  /** Base delay in ms between retries - doubles each attempt (default: 1000) */
  baseDelay?: number;
  /** Request timeout in ms (default: 55000 - just under Vercel's 60s limit) */
  timeout?: number;
}

/** Errors that are safe to retry (transient network issues) */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return true;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    // Don't retry user-initiated aborts, but do retry timeouts
    return false;
  }
  return false;
}

/** HTTP status codes that are safe to retry */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Fetch with automatic retry for transient failures and request timeout.
 *
 * Usage:
 * ```ts
 * const response = await fetchWithRetry("/api/revise-selection", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify(payload),
 * });
 * ```
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchWithRetryOptions,
): Promise<Response> {
  const { maxRetries = 2, baseDelay = 1000, timeout = 55000 } = options ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Create a per-attempt AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Merge with any existing signal from the caller
    const mergedSignal = init?.signal
      ? mergeAbortSignals(init.signal, controller.signal)
      : controller.signal;

    try {
      const response = await fetch(url, {
        ...init,
        signal: mergedSignal,
      });

      clearTimeout(timeoutId);

      // Don't retry client errors (4xx) except specific retryable ones
      if (!response.ok && isRetryableStatus(response.status) && attempt < maxRetries) {
        lastError = new Error(`HTTP ${response.status}`);
        await delay(baseDelay * Math.pow(2, attempt));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      // If the caller aborted (not our timeout), throw immediately
      if (init?.signal?.aborted) {
        throw error;
      }

      // Only retry on transient network errors
      if (attempt < maxRetries && isRetryableError(error)) {
        await delay(baseDelay * Math.pow(2, attempt));
        continue;
      }

      throw error;
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Merges two AbortSignals - aborts when either one fires.
 */
function mergeAbortSignals(
  signal1: AbortSignal,
  signal2: AbortSignal,
): AbortSignal {
  const controller = new AbortController();

  const onAbort = () => controller.abort();

  if (signal1.aborted || signal2.aborted) {
    controller.abort();
    return controller.signal;
  }

  signal1.addEventListener("abort", onAbort, { once: true });
  signal2.addEventListener("abort", onAbort, { once: true });

  return controller.signal;
}
