import { createAdminClient } from "@/lib/supabase/server";

const SYNC_COOLDOWN_MS = 60 * 60 * 1000;
const SYNC_STALE_MS = 30 * 60 * 1000;

interface SyncStateRow {
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
}

export async function acquireCatalogSyncLock(userId: string | null): Promise<{
  acquired: boolean;
  retryAfterMinutes?: number;
  error?: string;
}> {
  const service = createAdminClient();
  const { data, error } = await service
    .from("llm_catalog_sync_state")
    .select("last_sync_started_at, last_sync_completed_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return { acquired: false, error: error.message };
  }

  const state = (data as SyncStateRow | null) ?? null;
  const now = Date.now();
  const startedAt = state?.last_sync_started_at
    ? new Date(state.last_sync_started_at).getTime()
    : null;
  const completedAt = state?.last_sync_completed_at
    ? new Date(state.last_sync_completed_at).getTime()
    : null;

  const syncInProgress =
    startedAt !== null &&
    (completedAt === null || completedAt < startedAt) &&
    now - startedAt < SYNC_STALE_MS;

  if (syncInProgress) {
    return {
      acquired: false,
      error: "Catalog sync is already running. Try again in a few minutes.",
    };
  }

  const lastFinished = Math.max(startedAt ?? 0, completedAt ?? 0);
  if (lastFinished > 0 && now - lastFinished < SYNC_COOLDOWN_MS) {
    const retryAfterMinutes = Math.ceil((SYNC_COOLDOWN_MS - (now - lastFinished)) / 60000);
    return {
      acquired: false,
      retryAfterMinutes,
      error: `Catalog was synced recently. Try again in about ${retryAfterMinutes} minutes.`,
    };
  }

  const { error: updateError } = await service
    .from("llm_catalog_sync_state")
    .update({
      last_sync_started_at: new Date().toISOString(),
      last_sync_by_user_id: userId,
    } as never)
    .eq("id", 1);

  if (updateError) {
    return { acquired: false, error: updateError.message };
  }

  return { acquired: true };
}

export async function completeCatalogSync(): Promise<void> {
  const service = createAdminClient();
  const now = new Date().toISOString();

  await service
    .from("llm_catalog_sync_state")
    .update({
      last_sync_completed_at: now,
    } as never)
    .eq("id", 1);
}

export async function failCatalogSync(): Promise<void> {
  const service = createAdminClient();
  const now = new Date().toISOString();

  await service
    .from("llm_catalog_sync_state")
    .update({
      last_sync_completed_at: now,
    } as never)
    .eq("id", 1);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function upsertCatalogRowsInBatches(
  rows: Record<string, unknown>[],
  batchSize = 100,
): Promise<number> {
  if (rows.length === 0) return 0;

  const service = createAdminClient();
  let syncedCount = 0;

  for (const batch of chunk(rows, batchSize)) {
    const { error } = await service
      .from("llm_model_catalog")
      .upsert(batch as never[], { onConflict: "id" });

    if (!error) {
      syncedCount += batch.length;
    }
  }

  return syncedCount;
}
