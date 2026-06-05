"use server";

import { createClient } from "@/lib/supabase/server";
import { encrypt, safeDecrypt } from "@/lib/encryption";
import { EMPTY_KEY_STATUS, keyStatusFromRow } from "@/lib/api-key-status";

export type KeyStatus = {
  openai_key: boolean;
  anthropic_key: boolean;
  google_key: boolean;
  grok_key: boolean;
};

export type KeyName = keyof KeyStatus;

interface UserApiKeysRow {
  openai_key: string | null;
  anthropic_key: string | null;
  google_key: string | null;
  grok_key: string | null;
}

/**
 * Get which API keys are set for the current user.
 * Only returns boolean flags - never the actual keys.
 */
export async function getKeyStatusForUserId(userId: string): Promise<KeyStatus> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_api_keys")
    .select("openai_key, anthropic_key, google_key, grok_key")
    .eq("user_id", userId)
    .maybeSingle();

  return keyStatusFromRow((data as UserApiKeysRow | null) ?? null);
}

export async function getKeyStatus(): Promise<KeyStatus> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_KEY_STATUS;

  return getKeyStatusForUserId(user.id);
}

/**
 * Save a single API key for the current user.
 * The key is stored server-side and never returned to the client.
 */
export async function saveApiKey(
  keyName: KeyName,
  keyValue: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!keyValue || keyValue.trim().length === 0) {
    return { success: false, error: "API key cannot be empty" };
  }

  // Verify encryption key is configured before attempting to save
  if (!process.env.ENCRYPTION_KEY) {
    console.error("ENCRYPTION_KEY environment variable is not set");
    return { 
      success: false, 
      error: "Server encryption is not configured. Please contact the administrator." 
    };
  }

  // Encrypt the API key before storing
  let encryptedKey: string;
  try {
    encryptedKey = encrypt(keyValue.trim());
  } catch (error) {
    console.error("Failed to encrypt API key:", error);
    return { 
      success: false, 
      error: "Failed to encrypt API key. Server configuration error." 
    };
  }
  
  // Safety check: ensure encryption actually produced a different value
  if (encryptedKey === keyValue.trim()) {
    console.error("Encryption failed - output matches input");
    return { 
      success: false, 
      error: "Encryption verification failed. Please contact the administrator." 
    };
  }

  // Check if user already has a row
  const { data: existing } = await supabase
    .from("user_api_keys")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    // Update the specific key
    const { error } = await supabase
      .from("user_api_keys")
      .update({ [keyName]: encryptedKey } as never)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }
  } else {
    // Insert new row with this key
    const { error } = await supabase
      .from("user_api_keys")
      .insert({ 
        user_id: user.id, 
        [keyName]: encryptedKey 
      } as never);

    if (error) {
      return { success: false, error: error.message };
    }
  }

  return { success: true };
}

/**
 * Delete a single API key for the current user.
 */
export async function deleteApiKey(
  keyName: KeyName
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("user_api_keys")
    .update({ [keyName]: null } as never)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Test result from validating an API key against the provider.
 */
export interface TestKeyResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate an API key by calling the provider's lightweight models endpoint.
 * This uses zero tokens and only checks authentication/permissions.
 *
 * @param keyName - Which provider to test (openai_key, anthropic_key, etc.)
 * @param rawKey - Optional raw key to test before saving. If omitted, tests the saved key.
 */
export async function testApiKey(
  keyName: KeyName,
  rawKey?: string,
): Promise<TestKeyResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { valid: false, error: "Not authenticated" };
  }

  // Resolve the key to test: use raw key if provided, otherwise decrypt the saved key
  let apiKey: string | null = rawKey?.trim() || null;

  if (!apiKey) {
    const { data } = await supabase
      .from("user_api_keys")
      .select(keyName)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data || !(data as Record<string, string | null>)[keyName]) {
      return { valid: false, error: "No API key saved for this provider" };
    }

    apiKey = safeDecrypt((data as Record<string, string>)[keyName]);
    if (!apiKey) {
      return { valid: false, error: "Failed to decrypt saved key" };
    }
  }

  // Call the provider's models endpoint to validate the key
  try {
    const result = await validateKeyWithProvider(keyName, apiKey);
    return result;
  } catch (error) {
    console.error(`[testApiKey] Unexpected error for ${keyName}:`, error);
    return {
      valid: false,
      error: "An unexpected error occurred while testing the key",
    };
  }
}

/**
 * Makes a lightweight API call to the provider's models list endpoint.
 * These calls use zero tokens - they only check if the key is authorized.
 */
async function validateKeyWithProvider(
  keyName: KeyName,
  apiKey: string,
): Promise<TestKeyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    let url: string;
    let headers: Record<string, string>;

    switch (keyName) {
      case "openai_key":
        url = "https://api.openai.com/v1/models";
        headers = { Authorization: `Bearer ${apiKey}` };
        break;

      case "anthropic_key":
        url = "https://api.anthropic.com/v1/models";
        headers = {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        };
        break;

      case "google_key":
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        headers = {};
        break;

      case "grok_key":
        url = "https://api.x.ai/v1/models";
        headers = { Authorization: `Bearer ${apiKey}` };
        break;

      default:
        return { valid: false, error: "Unknown provider" };
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (response.ok) {
      return { valid: true };
    }

    // Parse the error response for a user-friendly message
    const providerName = PROVIDER_NAMES[keyName];
    const status = response.status;

    let errorDetail = "";
    try {
      const body = await response.json();
      // Extract nested error message from various provider formats
      if (body.error?.message) {
        errorDetail = body.error.message;
      } else if (body.message) {
        errorDetail = body.message;
      }
    } catch {
      // Response body wasn't JSON
    }

    switch (status) {
      case 401:
        return {
          valid: false,
          error: `Invalid ${providerName} API key. The key was rejected by ${providerName}. Please check that you copied it correctly.`,
        };
      case 403:
        return {
          valid: false,
          error: `Your ${providerName} API key does not have sufficient permissions. ${errorDetail || "Check your account settings."}`,
        };
      case 429:
        return {
          valid: false,
          error: `${providerName} rate limit or quota exceeded. Your key is valid but may have hit usage limits. ${errorDetail}`,
        };
      default:
        return {
          valid: false,
          error: `${providerName} returned an error (${status}). ${errorDetail || "Please try again."}`,
        };
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        valid: false,
        error: "Connection timed out. The provider may be experiencing issues. Please try again.",
      };
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg.includes("fetch failed") || msg.includes("ENOTFOUND")) {
      return {
        valid: false,
        error: "Unable to connect to the provider. Please check your internet connection.",
      };
    }
    return { valid: false, error: `Connection error: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

const PROVIDER_NAMES: Record<KeyName, string> = {
  openai_key: "OpenAI",
  anthropic_key: "Anthropic",
  google_key: "Google AI",
  grok_key: "xAI",
};

export interface DecryptedApiKeys {
  openai_key: string | null;
  anthropic_key: string | null;
  google_key: string | null;
  grok_key: string | null;
}

/**
 * Get decrypted API keys for the current user.
 * This is a server-only function for use in API routes.
 * Keys are decrypted on-the-fly and never stored in plaintext.
 */
export async function getDecryptedApiKeys(): Promise<DecryptedApiKeys | null> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("user_api_keys")
    .select("openai_key, anthropic_key, google_key, grok_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const typedData = data as unknown as UserApiKeysRow;

  // Decrypt each key if present
  return {
    openai_key: typedData.openai_key ? safeDecrypt(typedData.openai_key) : null,
    anthropic_key: typedData.anthropic_key ? safeDecrypt(typedData.anthropic_key) : null,
    google_key: typedData.google_key ? safeDecrypt(typedData.google_key) : null,
    grok_key: typedData.grok_key ? safeDecrypt(typedData.grok_key) : null,
  };
}

