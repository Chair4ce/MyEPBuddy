/**
 * Centralized LLM Provider Factory
 *
 * Single source of truth for creating model provider instances.
 * All API routes should import getModelProvider from here instead of
 * duplicating provider creation logic.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";
import type { DecryptedApiKeys } from "@/app/actions/api-keys";

/**
 * Supported LLM provider identifiers.
 */
export type LLMProvider = "openai" | "anthropic" | "google" | "xai";

/**
 * Detects the provider from a model ID string.
 * Uses prefix/substring matching that covers all known model ID patterns.
 */
export function detectProvider(modelId: string): LLMProvider {
  if (modelId.includes("claude")) return "anthropic";
  if (modelId.includes("gemini")) return "google";
  if (modelId.includes("grok")) return "xai";
  // Default to OpenAI for gpt-* and any unknown models
  return "openai";
}

/**
 * Returns a human-readable provider name for user-facing messages.
 */
export function getProviderDisplayName(provider: LLMProvider): string {
  const names: Record<LLMProvider, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google AI",
    xai: "xAI",
  };
  return names[provider];
}

/**
 * Returns the settings key name for a provider's API key in the user_api_keys table.
 */
export function getProviderKeyName(provider: LLMProvider): keyof DecryptedApiKeys {
  const keyMap: Record<LLMProvider, keyof DecryptedApiKeys> = {
    openai: "openai_key",
    anthropic: "anthropic_key",
    google: "google_key",
    xai: "grok_key",
  };
  return keyMap[provider];
}

const ENV_KEY_MAP: Record<LLMProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  xai: "XAI_API_KEY",
};

/**
 * Resolves the API key for a provider, checking user keys first then environment variables.
 * Returns null if no key is available (instead of empty string).
 */
function resolveApiKey(
  provider: LLMProvider,
  userKeys: Partial<DecryptedApiKeys> | null,
): string | null {
  const keyName = getProviderKeyName(provider);
  const userKey = userKeys?.[keyName];

  // Prefer user key, fall back to environment variable
  if (userKey && userKey.trim().length > 0) return userKey;
  const envKey = process.env[ENV_KEY_MAP[provider]];
  if (envKey && envKey.trim().length > 0) return envKey;

  return null;
}

/**
 * Checks whether the app's default (environment) API key will be used
 * for a given model+user combination. Returns true when the user has
 * no personal key for the model's provider.
 */
export function isUsingDefaultKey(
  modelId: string,
  userKeys: Partial<DecryptedApiKeys> | null,
): boolean {
  const provider = detectProvider(modelId);
  const keyName = getProviderKeyName(provider);
  const userKey = userKeys?.[keyName];
  return !userKey || userKey.trim().length === 0;
}

/**
 * Error thrown when no API key is available for a provider.
 * This is a pre-call validation error, NOT an API response error.
 */
export class MissingApiKeyError extends Error {
  public readonly provider: LLMProvider;
  public readonly providerDisplayName: string;

  constructor(provider: LLMProvider) {
    const displayName = getProviderDisplayName(provider);
    super(
      `No ${displayName} API key configured. Add one in Settings → API Keys to use ${displayName} models.`
    );
    this.name = "MissingApiKeyError";
    this.provider = provider;
    this.providerDisplayName = displayName;
  }
}

/**
 * Creates a model provider instance for the given model ID using user or environment keys.
 *
 * @param modelId - The model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514")
 * @param userKeys - Decrypted user API keys (null if not loaded)
 * @returns A LanguageModel instance ready for use with generateText()
 * @throws MissingApiKeyError if no API key is available for the detected provider
 */
export function getModelProvider(
  modelId: string,
  userKeys: Partial<DecryptedApiKeys> | null,
): LanguageModel {
  const provider = detectProvider(modelId);
  const apiKey = resolveApiKey(provider, userKeys);

  if (!apiKey) {
    throw new MissingApiKeyError(provider);
  }

  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    case "xai": {
      const xai = createXai({ apiKey });
      return xai(modelId);
    }
    default: {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
  }
}
