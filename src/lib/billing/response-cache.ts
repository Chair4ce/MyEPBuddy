import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type Json = Record<string, unknown>;

interface CachedRow {
  response: Json;
  credits_remaining: number | null;
}

/** Loosely-typed view of the admin client for the cache table (not in generated types). */
function cacheTable() {
  const supabase = createAdminClient() as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col2: string, val2: string) => {
            maybeSingle: () => Promise<{
              data: CachedRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
      upsert: (
        row: Json,
        opts: { onConflict: string; ignoreDuplicates: boolean },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  return supabase.from("billable_request_cache");
}

/**
 * Return a previously-cached successful response for this effective idempotency
 * key, or null. Lets a genuine retry skip both the credit charge and the LLM
 * call. Service-role access only (RLS has no policies).
 */
export async function getCachedBillableResponse(
  userId: string,
  idempotencyKey: string,
): Promise<NextResponse | null> {
  const { data, error } = await cacheTable()
    .select("response, credits_remaining")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const response = NextResponse.json(data.response);
  response.headers.set("X-Idempotent-Replay", "1");
  if (data.credits_remaining !== null) {
    response.headers.set("X-Credits-Remaining", String(data.credits_remaining));
  }
  return response;
}

/**
 * Persist a successful billable response. First write wins (concurrent retries
 * collapse to one row); failures here must never break the user's request.
 */
export async function storeBillableResponse(params: {
  userId: string;
  idempotencyKey: string;
  actionType?: string | null;
  payload: unknown;
  creditsRemaining?: number | null;
}): Promise<void> {
  try {
    await cacheTable().upsert(
      {
        user_id: params.userId,
        idempotency_key: params.idempotencyKey,
        action_type: params.actionType ?? null,
        response: params.payload as Json,
        credits_remaining: params.creditsRemaining ?? null,
      },
      { onConflict: "user_id,idempotency_key", ignoreDuplicates: true },
    );
  } catch (error) {
    console.error("[response-cache] store failed:", error);
  }
}
