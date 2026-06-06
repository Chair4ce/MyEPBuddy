import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_APP_FEATURE_FLAGS,
  parseAppFeatureFlags,
  type AppFeatureFlags,
} from "@/lib/feature-flags";

let cache: { flags: AppFeatureFlags; at: number } | null = null;
const CACHE_MS = 30_000;

/** Load app-wide feature flags from epb_config (short-lived in-memory cache). */
export async function getAppFeatureFlags(): Promise<AppFeatureFlags> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.flags;
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("epb_config")
      .select("show_prompt_editors, enable_prompt_rules")
      .eq("id", 1)
      .maybeSingle();

    const flags = data
      ? parseAppFeatureFlags(data)
      : { ...DEFAULT_APP_FEATURE_FLAGS };

    cache = { flags, at: Date.now() };
    return flags;
  } catch (error) {
    console.error("[feature-flags] failed to load epb_config:", error);
    return { ...DEFAULT_APP_FEATURE_FLAGS };
  }
}

export function invalidateAppFeatureFlagsCache(): void {
  cache = null;
}
