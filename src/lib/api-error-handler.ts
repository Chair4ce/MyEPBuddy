/**
 * Secure API Error Handler
 * 
 * This module provides standardized, secure error handling for API routes.
 * It ensures that:
 * 1. Detailed errors are logged server-side for debugging
 * 2. Generic, safe error messages are returned to clients
 * 3. No sensitive information (credentials, stack traces, internal details) leaks to clients
 */

import { NextResponse } from "next/server";

/**
 * Error codes that map to user-safe messages
 */
export const ERROR_CODES = {
  // Authentication/Authorization
  UNAUTHORIZED: { message: "Unauthorized", status: 401 },
  FORBIDDEN: { message: "Access denied", status: 403 },
  
  // Resource errors
  NOT_FOUND: { message: "Resource not found", status: 404 },
  ALREADY_EXISTS: { message: "Resource already exists", status: 409 },
  
  // Input errors
  BAD_REQUEST: { message: "Invalid request", status: 400 },
  MISSING_FIELDS: { message: "Missing required fields", status: 400 },
  INVALID_INPUT: { message: "Invalid input provided", status: 400 },
  
  // Server errors
  INTERNAL_ERROR: { message: "An unexpected error occurred", status: 500 },
  OPERATION_FAILED: { message: "Operation failed", status: 500 },
  DATABASE_ERROR: { message: "Database operation failed", status: 500 },
  EXTERNAL_SERVICE_ERROR: { message: "External service unavailable", status: 502 },
  
  // Rate limiting
  RATE_LIMITED: { message: "Too many requests", status: 429 },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/**
 * Creates a safe error response that doesn't leak internal details
 * 
 * @param code - Error code from ERROR_CODES
 * @param internalError - The actual error (logged server-side only)
 * @param context - Additional context for logging (e.g., "POST /api/generate")
 * @returns NextResponse with safe error message
 */
export function createErrorResponse(
  code: ErrorCode,
  internalError?: unknown,
  context?: string
): NextResponse {
  const { message, status } = ERROR_CODES[code];
  
  // Log full error details server-side
  if (internalError) {
    const errorDetails = internalError instanceof Error 
      ? { message: internalError.message, stack: internalError.stack }
      : internalError;
    
    console.error(
      `[API Error] ${context || "Unknown context"}:`,
      JSON.stringify({ code, ...errorDetails }, null, 2)
    );
  }
  
  // Return safe, generic message to client
  return NextResponse.json({ error: message }, { status });
}

/**
 * Wraps an API handler with standardized error handling
 * 
 * @param handler - The API handler function
 * @param routeName - Name of the route for logging
 * @returns Wrapped handler with error handling
 */
export function withErrorHandler<T extends Request>(
  handler: (request: T) => Promise<NextResponse>,
  routeName: string
): (request: T) => Promise<NextResponse> {
  return async (request: T) => {
    try {
      return await handler(request);
    } catch (error) {
      return createErrorResponse("INTERNAL_ERROR", error, routeName);
    }
  };
}

/**
 * Checks if an error is a Supabase error with specific code
 */
export function isSupabaseError(error: unknown, code?: string): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (code) {
      return (error as { code: string }).code === code;
    }
    return true;
  }
  return false;
}

/**
 * Sanitizes an error message to remove any potential sensitive information
 * This is a last-resort sanitization if a custom message must be used
 */
export function sanitizeErrorMessage(message: string): string {
  // Remove potential sensitive patterns
  const sensitivePatterns = [
    /key[=:]\s*["']?[a-zA-Z0-9_-]+["']?/gi, // API keys
    /password[=:]\s*["']?[^"'\s]+["']?/gi, // Passwords
    /secret[=:]\s*["']?[^"'\s]+["']?/gi, // Secrets
    /token[=:]\s*["']?[a-zA-Z0-9._-]+["']?/gi, // Tokens
    /bearer\s+[a-zA-Z0-9._-]+/gi, // Bearer tokens
    /\b[a-f0-9]{32,}\b/gi, // Hex strings (potential keys/hashes)
    /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, // JWTs
  ];
  
  let sanitized = message;
  for (const pattern of sensitivePatterns) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  
  return sanitized;
}
