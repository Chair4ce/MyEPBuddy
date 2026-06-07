"use server";

import { createClient } from "@/lib/supabase/server";
import type { KeyStatus } from "@/app/actions/api-keys";
import { EMPTY_KEY_STATUS, keyStatusFromRow } from "@/lib/api-key-status";
import {
  getCachedCatalogRows,
  getCatalogSyncedAt,
} from "@/lib/ai-models/catalog-cache";
import {
  getDefaultModelId,
  parseModelPreferences,
  reconcileModelSelection,
  resolveAvailableModels,
  userHasOwnApiKey,
} from "@/lib/ai-models/catalog";
import { runModelCatalogSync } from "@/lib/ai-models/run-catalog-sync";
import { acquireCatalogSyncLock } from "@/lib/ai-models/sync-lock";
import type {
  AvailableModel,
  CatalogModelRow,
  ModelContext,
  ModelProvider,
  UserModelPreferences,
} from "@/lib/ai-models/types";
import { EMPTY_MODEL_PREFERENCES } from "@/lib/ai-models/types";

async function isUserAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return (data as { role: string } | null)?.role === "admin";
}

async function loadUserModelContext(userId: string): Promise<{
  keyStatus: KeyStatus;
  preferences: UserModelPreferences;
  creditBalance: number;
  preferCreditsFirst: boolean;
}> {
  const supabase = await createClient();

  const [keysResult, settingsResult, creditsResult] = await Promise.all([
    supabase
      .from("user_api_keys")
      .select("openai_key, anthropic_key, google_key, grok_key")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_llm_settings")
      .select("model_preferences")
      .eq("user_id", userId)
      .maybeSingle(),
    (supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { balance: number; prefer_credits_first: boolean } | null;
              error: unknown;
            }>;
          };
        };
      };
    })
      .from("user_credits")
      .select("balance, prefer_credits_first")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const keyStatus = keyStatusFromRow(
    (keysResult.data as {
      openai_key: string | null;
      anthropic_key: string | null;
      google_key: string | null;
      grok_key: string | null;
    } | null) ?? null,
  );

  const preferences =
    settingsResult.error || !settingsResult.data
      ? EMPTY_MODEL_PREFERENCES
      : parseModelPreferences(
          (settingsResult.data as { model_preferences: unknown }).model_preferences,
        );

  const credits = creditsResult.data;

  return {
    keyStatus,
    preferences,
    creditBalance: credits?.balance ?? 0,
    // Default to true when no row/column yet — matches the DB column default.
    preferCreditsFirst: credits?.prefer_credits_first ?? true,
  };
}

export async function getAvailableModels(
  context?: ModelContext,
): Promise<{
  models: AvailableModel[];
  defaultModelId: string;
  preferences: UserModelPreferences;
  keyStatus: KeyStatus;
  catalogSyncedAt: string | null;
  creditsFirstActive: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [catalogRows, userContext] = await Promise.all([
    getCachedCatalogRows(),
    user ? loadUserModelContext(user.id) : Promise.resolve(null),
  ]);

  const keyStatus = userContext?.keyStatus ?? EMPTY_KEY_STATUS;
  const preferences = userContext?.preferences ?? EMPTY_MODEL_PREFERENCES;

  // Active only when the user has their own key, a positive balance, and the
  // preference enabled. Drives default-model resolution so credits are spent
  // on the free model before cutting over to the user's own-key model.
  const creditsFirstActive = Boolean(
    userContext &&
      userContext.preferCreditsFirst &&
      userContext.creditBalance > 0 &&
      userHasOwnApiKey(keyStatus),
  );

  const models = resolveAvailableModels(catalogRows, keyStatus, preferences);
  const defaultModelId = getDefaultModelId(
    models,
    preferences,
    context,
    keyStatus,
    creditsFirstActive,
  );

  return {
    models,
    defaultModelId,
    preferences,
    keyStatus,
    catalogSyncedAt: getCatalogSyncedAt(catalogRows),
    creditsFirstActive,
  };
}

export async function resolveRequestedModel(
  requestedModel: string | undefined,
  context?: ModelContext,
): Promise<string> {
  const available = await getAvailableModels(context);
  return reconcileModelSelection(
    requestedModel,
    available.models,
    available.defaultModelId,
    available.keyStatus,
  );
}

export async function saveModelPreferences(
  preferences: UserModelPreferences,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const sanitized: UserModelPreferences = {
    visible_model_ids: preferences.visible_model_ids,
    defaults: preferences.defaults ?? {},
  };

  const { data: existing } = await supabase
    .from("user_llm_settings")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("user_llm_settings")
      .update({ model_preferences: sanitized } as never)
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  const { error } = await supabase.from("user_llm_settings").insert({
    user_id: user.id,
    model_preferences: sanitized,
  } as never);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function syncModelCatalog(): Promise<{
  success: boolean;
  syncedCount: number;
  deprecatedCount: number;
  providers: ModelProvider[];
  error?: string;
  skipped?: boolean;
  retryAfterMinutes?: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      syncedCount: 0,
      deprecatedCount: 0,
      providers: [],
      error: "Not authenticated",
    };
  }

  const admin = await isUserAdmin(user.id);
  if (!admin) {
    return {
      success: false,
      syncedCount: 0,
      deprecatedCount: 0,
      providers: [],
      error: "Only administrators can refresh the model catalog.",
    };
  }

  const lock = await acquireCatalogSyncLock(user.id);
  if (!lock.acquired) {
    return {
      success: false,
      syncedCount: 0,
      deprecatedCount: 0,
      providers: [],
      error: lock.error,
      skipped: true,
      retryAfterMinutes: lock.retryAfterMinutes,
    };
  }

  return runModelCatalogSync();
}

export async function getModelCatalogForSettings(): Promise<{
  allModels: CatalogModelRow[];
  availableModels: AvailableModel[];
  preferences: UserModelPreferences;
  keyStatus: KeyStatus;
  catalogSyncedAt: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [catalogRows, userContext] = await Promise.all([
    getCachedCatalogRows(),
    user ? loadUserModelContext(user.id) : Promise.resolve(null),
  ]);

  const keyStatus = userContext?.keyStatus ?? EMPTY_KEY_STATUS;
  const preferences = userContext?.preferences ?? EMPTY_MODEL_PREFERENCES;

  const availableModels = resolveAvailableModels(catalogRows, keyStatus, {
    ...preferences,
    visible_model_ids: null,
  });

  return {
    allModels: catalogRows,
    availableModels,
    preferences,
    keyStatus,
    catalogSyncedAt: getCatalogSyncedAt(catalogRows),
  };
}
