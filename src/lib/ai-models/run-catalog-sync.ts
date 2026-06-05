import { createAdminClient } from "@/lib/supabase/server";
import { invalidateCatalogCache } from "@/lib/ai-models/catalog-cache";
import {
  mergeDiscoveredModelMetadata,
  providersWithEnvKeys,
} from "@/lib/ai-models/catalog";
import { fetchProviderModels } from "@/lib/ai-models/provider-sync";
import {
  completeCatalogSync,
  failCatalogSync,
  upsertCatalogRowsInBatches,
} from "@/lib/ai-models/sync-lock";
import type { ModelProvider } from "@/lib/ai-models/types";

const PROVIDER_ENV_KEYS: Record<ModelProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  xai: "XAI_API_KEY",
};

export async function runModelCatalogSync(): Promise<{
  success: boolean;
  syncedCount: number;
  deprecatedCount: number;
  providers: ModelProvider[];
  error?: string;
}> {
  const providers = providersWithEnvKeys();
  if (providers.length === 0) {
    await failCatalogSync();
    return {
      success: false,
      syncedCount: 0,
      deprecatedCount: 0,
      providers: [],
      error: "No provider API keys configured on the server.",
    };
  }

  const service = createAdminClient();
  const discoveredIds = new Set<string>();
  const now = new Date().toISOString();
  const upsertRows: Record<string, unknown>[] = [];

  try {
    for (const provider of providers) {
      const apiKey = process.env[PROVIDER_ENV_KEYS[provider]];
      if (!apiKey?.trim()) continue;

      const discovered = await fetchProviderModels(provider, apiKey.trim());
      for (const model of discovered) {
        discoveredIds.add(model.id);
        const metadata = mergeDiscoveredModelMetadata(
          model.id,
          model.provider,
          model.displayName,
          model.description,
        );

        upsertRows.push({
          ...metadata,
          is_active: true,
          supports_default_key: true,
          last_seen_at: now,
          deprecated_at: null,
          updated_at: now,
        });
      }
    }

    const syncedCount = await upsertCatalogRowsInBatches(upsertRows);

    const { data: existingRows, error: existingError } = await service
      .from("llm_model_catalog")
      .select("id, is_app_default, provider")
      .eq("is_active", true);

    if (existingError) {
      await failCatalogSync();
      return {
        success: false,
        syncedCount,
        deprecatedCount: 0,
        providers,
        error: existingError.message,
      };
    }

    let deprecatedCount = 0;
    const syncedProviders = new Set(providers);

    for (const row of existingRows ?? []) {
      const typed = row as { id: string; is_app_default: boolean; provider: ModelProvider };
      if (typed.is_app_default) continue;
      if (!syncedProviders.has(typed.provider)) continue;
      if (discoveredIds.has(typed.id)) continue;

      const { error } = await service
        .from("llm_model_catalog")
        .update({
          is_active: false,
          deprecated_at: now,
          updated_at: now,
        } as never)
        .eq("id", typed.id);

      if (!error) deprecatedCount += 1;
    }

    invalidateCatalogCache();
    await completeCatalogSync();

    return {
      success: true,
      syncedCount,
      deprecatedCount,
      providers,
    };
  } catch (error) {
    await failCatalogSync();
    return {
      success: false,
      syncedCount: 0,
      deprecatedCount: 0,
      providers,
      error: error instanceof Error ? error.message : "Catalog sync failed",
    };
  }
}
