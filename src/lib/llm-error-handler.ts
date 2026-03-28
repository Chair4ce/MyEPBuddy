/**
 * LLM Error Handler
 *
 * Parses provider-specific errors from AI SDK calls into user-friendly messages.
 * Handles all known error types from OpenAI, Anthropic, Google, and xAI providers.
 *
 * Security: Strips API keys, tokens, and internal details from user-facing messages.
 * Logs full error details server-side for debugging.
 */

import { APICallError } from "ai";
import { NextResponse } from "next/server";
import { MissingApiKeyError, detectProvider, getProviderDisplayName, type LLMProvider } from "@/lib/llm-provider";

/**
 * Structured error response returned to the client.
 * Contains a user-friendly message and an error code for programmatic handling.
 */
export interface LLMErrorResponse {
  /** User-friendly error message safe for display in toasts */
  error: string;
  /** Machine-readable error code for client-side conditional handling */
  errorCode: LLMErrorCode;
  /** The LLM provider that produced the error */
  provider?: string;
}

/**
 * Error codes covering all known LLM provider failure modes.
 */
export type LLMErrorCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "expired_api_key"
  | "rate_limit_exceeded"
  | "quota_exceeded"
  | "insufficient_funds"
  | "model_not_found"
  | "content_filtered"
  | "context_length_exceeded"
  | "provider_overloaded"
  | "provider_unavailable"
  | "request_timeout"
  | "invalid_request"
  | "permission_denied"
  | "generation_failed"
  | "usage_limit_exceeded"
  | "burst_rate_limited";

/**
 * Maps an error from an LLM API call to a user-friendly error response.
 *
 * @param error - The caught error from generateText() or similar AI SDK calls
 * @param routeContext - A descriptive name for logging (e.g., "POST /api/generate")
 * @param modelId - Optional model ID for more specific error messages
 * @returns NextResponse with appropriate status code and user-friendly error
 */
export function handleLLMError(
  error: unknown,
  routeContext: string,
  modelId?: string,
): NextResponse<LLMErrorResponse> {
  // Log full error server-side for debugging
  console.error(`[LLM Error] ${routeContext}:`, error);

  // Handle missing API key (pre-call validation)
  if (error instanceof MissingApiKeyError) {
    return NextResponse.json(
      {
        error: error.message,
        errorCode: "missing_api_key" as LLMErrorCode,
        provider: error.providerDisplayName,
      },
      { status: 400 },
    );
  }

  // Handle AI SDK API call errors (responses from the provider)
  if (error instanceof APICallError) {
    const provider = modelId ? detectProvider(modelId) : undefined;
    const parsed = parseAPICallError(error, provider);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }

  // Handle generic Error objects (may contain provider info in message)
  if (error instanceof Error) {
    const parsed = parseGenericError(error, modelId);
    return NextResponse.json(parsed.body, { status: parsed.status });
  }

  // Fallback for unknown error types
  return NextResponse.json(
    {
      error: "An unexpected error occurred while generating. Please try again.",
      errorCode: "generation_failed" as LLMErrorCode,
    },
    { status: 500 },
  );
}

/** Internal parsed error result */
interface ParsedError {
  status: number;
  body: LLMErrorResponse;
}

/**
 * Parses an APICallError from the AI SDK to extract provider-specific details.
 */
function parseAPICallError(
  error: APICallError,
  provider?: LLMProvider,
): ParsedError {
  const statusCode = error.statusCode ?? 500;
  const providerName = provider ? getProviderDisplayName(provider) : "AI provider";
  const responseBody = error.responseBody ?? "";
  const message = error.message ?? "";

  // Try to parse the response body for more details
  let parsedBody: Record<string, unknown> = {};
  try {
    if (responseBody) {
      parsedBody = JSON.parse(responseBody);
    }
  } catch {
    // Response body is not JSON, use raw message
  }

  // Extract nested error message from provider response
  const providerMessage = extractProviderMessage(parsedBody, message);

  // Map by status code + provider-specific patterns
  switch (statusCode) {
    case 401:
      return {
        status: 401,
        body: {
          error: `Your ${providerName} API key is invalid or has been revoked. Please update it in Settings → API Keys.`,
          errorCode: "invalid_api_key",
          provider: providerName,
        },
      };

    case 403:
      // Check for specific permission issues
      if (containsAny(providerMessage, ["permission", "forbidden", "access denied"])) {
        return {
          status: 403,
          body: {
            error: `Your ${providerName} API key does not have permission to use this model. Please check your API key permissions or try a different model.`,
            errorCode: "permission_denied",
            provider: providerName,
          },
        };
      }
      return {
        status: 403,
        body: {
          error: `Access denied by ${providerName}. Your API key may not have permission for this operation. ${sanitizeForUser(providerMessage)}`,
          errorCode: "permission_denied",
          provider: providerName,
        },
      };

    case 429:
      // Differentiate between rate limit and quota exhaustion
      if (containsAny(providerMessage, ["quota", "exceeded", "billing", "insufficient", "funds", "credits", "budget"])) {
        return {
          status: 429,
          body: {
            error: `Your ${providerName} API key has reached its usage quota or billing limit. Please check your ${providerName} account billing and usage limits.`,
            errorCode: "quota_exceeded",
            provider: providerName,
          },
        };
      }
      return {
        status: 429,
        body: {
          error: `${providerName} rate limit reached. You're sending requests too quickly. Please wait a moment and try again.`,
          errorCode: "rate_limit_exceeded",
          provider: providerName,
        },
      };

    case 400:
      // Handle various 400 errors
      if (containsAny(providerMessage, ["context length", "token limit", "maximum context", "too long", "max_tokens"])) {
        return {
          status: 400,
          body: {
            error: `The request was too long for the selected model. Try reducing the amount of input text or selecting a model with a larger context window.`,
            errorCode: "context_length_exceeded",
            provider: providerName,
          },
        };
      }
      if (containsAny(providerMessage, ["content filter", "safety", "blocked", "harmful", "refused"])) {
        return {
          status: 400,
          body: {
            error: `${providerName} blocked the request due to content safety filters. Please review your input text and remove any content that may trigger safety filters.`,
            errorCode: "content_filtered",
            provider: providerName,
          },
        };
      }
      if (containsAny(providerMessage, ["model", "not found", "does not exist", "invalid model", "not available"])) {
        return {
          status: 400,
          body: {
            error: `The selected model is not available or not supported by your ${providerName} API key. Please try a different model.`,
            errorCode: "model_not_found",
            provider: providerName,
          },
        };
      }
      if (containsAny(providerMessage, ["api key", "api_key", "invalid key", "authentication"])) {
        return {
          status: 400,
          body: {
            error: `Your ${providerName} API key appears to be invalid. Please check and update it in Settings → API Keys.`,
            errorCode: "invalid_api_key",
            provider: providerName,
          },
        };
      }
      // Generic 400 with provider message
      return {
        status: 400,
        body: {
          error: `${providerName} rejected the request: ${sanitizeForUser(providerMessage) || "Invalid request. Please try again with different input."}`,
          errorCode: "invalid_request",
          provider: providerName,
        },
      };

    case 404:
      return {
        status: 404,
        body: {
          error: `The selected model was not found on ${providerName}. It may have been deprecated or your API key may not have access. Please try a different model.`,
          errorCode: "model_not_found",
          provider: providerName,
        },
      };

    case 408:
      return {
        status: 408,
        body: {
          error: `The request to ${providerName} timed out. The service may be experiencing high load. Please try again.`,
          errorCode: "request_timeout",
          provider: providerName,
        },
      };

    case 500:
    case 502:
    case 503:
      return {
        status: 502,
        body: {
          error: `${providerName} is currently experiencing issues (server error). Please try again in a few moments or select a different model.`,
          errorCode: "provider_unavailable",
          provider: providerName,
        },
      };

    case 529:
      // Anthropic-specific: overloaded
      return {
        status: 529,
        body: {
          error: `${providerName} is currently overloaded with requests. Please wait a moment and try again, or select a different model.`,
          errorCode: "provider_overloaded",
          provider: providerName,
        },
      };

    default:
      return {
        status: statusCode >= 500 ? 502 : statusCode,
        body: {
          error: `${providerName} returned an error (${statusCode}): ${sanitizeForUser(providerMessage) || "Please try again or select a different model."}`,
          errorCode: "generation_failed",
          provider: providerName,
        },
      };
  }
}

/**
 * Parses a generic Error that may contain provider-specific information.
 */
function parseGenericError(
  error: Error,
  modelId?: string,
): ParsedError {
  const provider = modelId ? detectProvider(modelId) : undefined;
  const providerName = provider ? getProviderDisplayName(provider) : "AI provider";
  const msg = error.message.toLowerCase();

  // Check for common patterns in error messages
  if (containsAny(msg, ["timeout", "timed out", "econnreset", "econnrefused"])) {
    return {
      status: 504,
      body: {
        error: `Connection to ${providerName} timed out. The service may be experiencing high load. Please try again.`,
        errorCode: "request_timeout",
        provider: providerName,
      },
    };
  }

  if (containsAny(msg, ["rate limit", "ratelimit", "too many requests"])) {
    return {
      status: 429,
      body: {
        error: `${providerName} rate limit reached. Please wait a moment and try again.`,
        errorCode: "rate_limit_exceeded",
        provider: providerName,
      },
    };
  }

  if (containsAny(msg, ["api key", "apikey", "unauthorized", "authentication", "invalid key"])) {
    return {
      status: 401,
      body: {
        error: `Your ${providerName} API key is invalid or missing. Please update it in Settings → API Keys.`,
        errorCode: "invalid_api_key",
        provider: providerName,
      },
    };
  }

  if (containsAny(msg, ["quota", "billing", "insufficient", "credits", "exceeded"])) {
    return {
      status: 429,
      body: {
        error: `Your ${providerName} API key has reached its usage quota. Please check your ${providerName} account billing and usage limits.`,
        errorCode: "quota_exceeded",
        provider: providerName,
      },
    };
  }

  if (containsAny(msg, ["content filter", "safety", "blocked", "moderation"])) {
    return {
      status: 400,
      body: {
        error: `${providerName} blocked the request due to content safety filters. Please review your input.`,
        errorCode: "content_filtered",
        provider: providerName,
      },
    };
  }

  if (containsAny(msg, ["fetch failed", "network", "enotfound", "dns"])) {
    return {
      status: 503,
      body: {
        error: `Unable to connect to ${providerName}. Please check your internet connection and try again.`,
        errorCode: "provider_unavailable",
        provider: providerName,
      },
    };
  }

  // Default: pass through a sanitized version of the error message
  return {
    status: 500,
    body: {
      error: `Generation failed: ${sanitizeForUser(error.message) || "An unexpected error occurred. Please try again."}`,
      errorCode: "generation_failed",
      provider: providerName,
    },
  };
}

/**
 * Extracts the most useful error message from a provider's response body.
 */
function extractProviderMessage(
  body: Record<string, unknown>,
  fallback: string,
): string {
  // OpenAI: { error: { message: "...", type: "...", code: "..." } }
  if (body.error && typeof body.error === "object") {
    const err = body.error as Record<string, unknown>;
    if (typeof err.message === "string") return err.message;
  }

  // Anthropic: { type: "error", error: { type: "...", message: "..." } }
  if (body.type === "error" && body.error && typeof body.error === "object") {
    const err = body.error as Record<string, unknown>;
    if (typeof err.message === "string") return err.message;
  }

  // Google: { error: { message: "...", status: "..." } }
  if (body.error && typeof body.error === "object") {
    const err = body.error as Record<string, unknown>;
    if (typeof err.message === "string") return err.message;
  }

  // Flat message field
  if (typeof body.message === "string") return body.message;

  // Array of errors
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const first = body.errors[0];
    if (typeof first === "object" && first !== null && "message" in first) {
      return String(first.message);
    }
  }

  return fallback;
}

/**
 * Sanitizes an error message to remove sensitive information before showing to users.
 * Strips API keys, tokens, URLs, and internal details.
 */
function sanitizeForUser(message: string): string {
  if (!message) return "";

  let sanitized = message;

  // Remove API keys and tokens
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9_-]{20,}/g, "[API_KEY]");
  sanitized = sanitized.replace(/key-[a-zA-Z0-9_-]{20,}/g, "[API_KEY]");
  sanitized = sanitized.replace(/xai-[a-zA-Z0-9_-]{20,}/g, "[API_KEY]");
  sanitized = sanitized.replace(/AIza[a-zA-Z0-9_-]{30,}/g, "[API_KEY]");
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "[TOKEN]");
  sanitized = sanitized.replace(/\b[a-f0-9]{32,}\b/gi, "[REDACTED]");

  // Remove full URLs (may contain sensitive params)
  sanitized = sanitized.replace(/https?:\/\/[^\s"']+/g, "[URL]");

  // Remove stack traces
  sanitized = sanitized.replace(/\s+at\s+.*\(.*\)/g, "");
  sanitized = sanitized.replace(/\n\s+at\s+.*/g, "");

  // Truncate to reasonable length for toast display
  if (sanitized.length > 300) {
    sanitized = sanitized.substring(0, 297) + "...";
  }

  return sanitized.trim();
}

/**
 * Checks if a string contains any of the given substrings (case-insensitive).
 */
function containsAny(text: string, substrings: string[]): boolean {
  const lower = text.toLowerCase();
  return substrings.some((s) => lower.includes(s.toLowerCase()));
}

/**
 * Returns a 429 response when the user has exceeded their weekly usage limit
 * on the app's default API key.
 */
export function handleUsageLimitExceeded(
  weeklyUsed: number,
  weeklyLimit: number,
): NextResponse<LLMErrorResponse> {
  return NextResponse.json(
    {
      error: `You've used all ${weeklyLimit} free AI actions for this week (${weeklyUsed}/${weeklyLimit}). Add your own API key in Settings → API Keys for unlimited usage, or wait until the limit resets next Monday.`,
      errorCode: "usage_limit_exceeded" as LLMErrorCode,
    },
    { status: 429 },
  );
}

export function handleBurstRateLimited(): NextResponse<LLMErrorResponse> {
  return NextResponse.json(
    {
      error: "You're sending requests too quickly. Please wait a moment and try again.",
      errorCode: "burst_rate_limited" as LLMErrorCode,
    },
    { status: 429 },
  );
}
