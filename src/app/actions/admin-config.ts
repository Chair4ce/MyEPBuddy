"use server";

import { getAdminApiUser } from "@/lib/auth/require-admin";
import { invalidateAppFeatureFlagsCache } from "@/lib/feature-flags/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { EPBConfig } from "@/types/database";

type FeatureFlagKey =
  | "enable_collaboration"
  | "enable_prompt_rules"
  | "show_prompt_editors";

type AdminConfigResult =
  | { ok: true; config: EPBConfig }
  | { ok: false; error: string };

export async function updateAdminFeatureFlag(
  key: FeatureFlagKey,
  checked: boolean,
): Promise<AdminConfigResult> {
  const auth = await getAdminApiUser();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("epb_config")
    .update({ [key]: checked })
    .eq("id", 1)
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  invalidateAppFeatureFlagsCache();
  return { ok: true, config: data as EPBConfig };
}

export async function updateAdminSignupTrialCredits(
  credits: number,
): Promise<AdminConfigResult> {
  const auth = await getAdminApiUser();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  if (!Number.isInteger(credits) || credits < 1 || credits > 1000) {
    return { ok: false, error: "Credits must be a whole number between 1 and 1000." };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("epb_config")
    .update({ signup_trial_credits: credits })
    .eq("id", 1)
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, config: data as EPBConfig };
}

export async function updateAdminDefaultKeyRpm(
  rpm: number,
): Promise<AdminConfigResult> {
  const auth = await getAdminApiUser();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  if (!Number.isInteger(rpm) || rpm < 5 || rpm > 2000) {
    return {
      ok: false,
      error: "Default-key RPM must be a whole number between 5 and 2000.",
    };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("epb_config")
    .update({ default_key_rpm: rpm })
    .eq("id", 1)
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, config: data as EPBConfig };
}
