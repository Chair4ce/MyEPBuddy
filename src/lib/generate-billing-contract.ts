/**
 * Product billing contract for POST /api/generate:
 * - One prepaid credit covers the whole request (all versionCount alternatives).
 * - Empty usable results must refund — never keep the credit on total failure.
 */

/** How many times checkAndTrackUsage may run per generate request. */
export const GENERATE_USAGE_CHECKS_PER_REQUEST = 1 as const;

/** True when the model produced nothing usable and the credit must be refunded. */
export function shouldRefundGenerateForEmptyResults(resultsLength: number): boolean {
  return resultsLength === 0;
}
