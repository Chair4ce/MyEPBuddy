import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import type { CatalogModelRow } from "@/lib/ai-models/types";

export const LLM_CATALOG_CACHE_TAG = "llm-model-catalog";
const CATALOG_CACHE_SECONDS = 300;

const CATALOG_SELECT =
  "id, provider, display_name, description, quality, statement_tip, is_app_default, is_active, supports_default_key, sort_order, last_seen_at, deprecated_at, input_price_per_mtok, output_price_per_mtok, cached_input_price_per_mtok, price_currency";

async function fetchCatalogRowsFromDb(): Promise<CatalogModelRow[]> {
  const service = createAdminClient();
  const { data, error } = await service
    .from("llm_model_catalog")
    .select(CATALOG_SELECT)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[ai-models] Failed to load catalog:", error.message);
    return [];
  }

  return (data ?? []) as CatalogModelRow[];
}

export const getCachedCatalogRows = unstable_cache(
  fetchCatalogRowsFromDb,
  ["llm-model-catalog-rows"],
  {
    revalidate: CATALOG_CACHE_SECONDS,
    tags: [LLM_CATALOG_CACHE_TAG],
  },
);

export function invalidateCatalogCache(): void {
  revalidateTag(LLM_CATALOG_CACHE_TAG);
}

export function getCatalogSyncedAt(rows: CatalogModelRow[]): string | null {
  if (rows.length === 0) return null;

  return rows.reduce((latest, row) =>
    row.last_seen_at > latest ? row.last_seen_at : latest,
  rows[0].last_seen_at);
}
