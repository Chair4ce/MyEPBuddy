import { useUserStore } from "@/stores/user-store";
import type { EPBConfig } from "@/types/database";

/** Fallback when epb_config has not loaded yet (matches migration 159 defaults). */
export const DEFAULT_APP_FEATURE_FLAGS = {
  showPromptEditors: false,
  enablePromptRules: true,
} as const;

export type AppFeatureFlags = {
  showPromptEditors: boolean;
  enablePromptRules: boolean;
};

export function parseAppFeatureFlags(
  row:
    | {
        show_prompt_editors?: boolean | null;
        enable_prompt_rules?: boolean | null;
      }
    | null
    | undefined,
): AppFeatureFlags {
  return {
    showPromptEditors:
      row?.show_prompt_editors ?? DEFAULT_APP_FEATURE_FLAGS.showPromptEditors,
    enablePromptRules:
      row?.enable_prompt_rules ?? DEFAULT_APP_FEATURE_FLAGS.enablePromptRules,
  };
}

export function getFeatureFlagsFromConfig(
  config: EPBConfig | null | undefined,
): AppFeatureFlags {
  return parseAppFeatureFlags(config);
}

/** True when prompt editors are hidden and per-context rules CRUD is active. */
export function isPromptRulesMode(flags: AppFeatureFlags): boolean {
  return flags.enablePromptRules && !flags.showPromptEditors;
}

/** Client hook — reads live flags from epb_config via the user store. */
export function usePromptRulesMode(): boolean {
  const epbConfig = useUserStore((state) => state.epbConfig);
  return isPromptRulesMode(getFeatureFlagsFromConfig(epbConfig));
}
