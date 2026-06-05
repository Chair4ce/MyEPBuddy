import type { ModelQuality } from "@/lib/constants";

export type ModelProvider = "openai" | "anthropic" | "google" | "xai";

export type ModelContext =
  | "generate"
  | "award"
  | "decoration"
  | "library"
  | "global";

export interface CatalogModelRow {
  id: string;
  provider: ModelProvider;
  display_name: string;
  description: string;
  quality: ModelQuality;
  statement_tip: string;
  is_app_default: boolean;
  is_active: boolean;
  supports_default_key: boolean;
  sort_order: number;
  last_seen_at: string;
  deprecated_at: string | null;
}

export interface AvailableModel {
  id: string;
  name: string;
  provider: ModelProvider;
  description: string;
  quality: ModelQuality;
  statementTip: string;
  isAppDefault: boolean;
  requiresUserKey: boolean;
  isDeprecated: boolean;
  usingUserKey: boolean;
}

export interface UserModelPreferences {
  visible_model_ids: string[] | null;
  defaults: Partial<Record<ModelContext, string>>;
}

export const EMPTY_MODEL_PREFERENCES: UserModelPreferences = {
  visible_model_ids: null,
  defaults: {},
};

export interface ProviderDiscoveredModel {
  id: string;
  provider: ModelProvider;
  displayName: string;
  description?: string;
}

export interface AvailableModelsPayload {
  models: AvailableModel[];
  defaultModelId: string;
  preferences: UserModelPreferences;
  keyStatus: import("@/app/actions/api-keys").KeyStatus | null;
  catalogSyncedAt: string | null;
}
