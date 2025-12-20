"use server";

import { createClient } from "@/lib/supabase/server";

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
export async function getKeyStatus(): Promise<KeyStatus> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      openai_key: false,
      anthropic_key: false,
      google_key: false,
      grok_key: false,
    };
  }

  // Only select whether keys exist, not the actual values
  const { data } = await supabase
    .from("user_api_keys")
    .select("openai_key, anthropic_key, google_key, grok_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    return {
      openai_key: false,
      anthropic_key: false,
      google_key: false,
      grok_key: false,
    };
  }

  const typedData = data as unknown as UserApiKeysRow;

  // Convert to boolean flags - we check if the key exists, not what it is
  return {
    openai_key: !!typedData.openai_key,
    anthropic_key: !!typedData.anthropic_key,
    google_key: !!typedData.google_key,
    grok_key: !!typedData.grok_key,
  };
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
      .update({ [keyName]: keyValue.trim() } as never)
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
        [keyName]: keyValue.trim() 
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

