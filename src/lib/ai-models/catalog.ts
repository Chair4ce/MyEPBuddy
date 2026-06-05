import { DEFAULT_APP_MODEL_ID, AI_MODELS, type ModelQuality } from "@/lib/constants";
import type { KeyStatus } from "@/app/actions/api-keys";
import {
  isModelAvailableForStatus,
  KEY_NAME_TO_PROVIDER,
} from "@/lib/model-preferences";
import type {
  AvailableModel,
  CatalogModelRow,
  ModelContext,
  ModelProvider,
  UserModelPreferences,
} from "@/lib/ai-models/types";
import { EMPTY_MODEL_PREFERENCES } from "@/lib/ai-models/types";

const PROVIDER_KEY_MAP: Record<ModelProvider, keyof KeyStatus> = {
  openai: "openai_key",
  anthropic: "anthropic_key",
  google: "google_key",
  xai: "grok_key",
};

export function parseModelPreferences(raw: unknown): UserModelPreferences {
  if (!raw || typeof raw !== "object") return EMPTY_MODEL_PREFERENCES;

  const value = raw as Partial<UserModelPreferences>;
  const visible = value.visible_model_ids;
  const defaults =
    value.defaults && typeof value.defaults === "object" ? value.defaults : {};

  return {
    visible_model_ids: Array.isArray(visible)
      ? visible.filter((id): id is string => typeof id === "string")
      : null,
    defaults,
  };
}

export function catalogRowToAvailableModel(
  row: CatalogModelRow,
  keyStatus: KeyStatus,
): AvailableModel | null {
  const providerKey = PROVIDER_KEY_MAP[row.provider];
  const hasUserKey = keyStatus[providerKey];
  const availableWithoutUserKey = row.is_app_default || row.supports_default_key;

  if (!row.is_active && !row.is_app_default) {
    return null;
  }

  if (!hasUserKey && !availableWithoutUserKey) {
    return null;
  }

  return {
    id: row.id,
    name: row.display_name,
    provider: row.provider,
    description: row.description,
    quality: row.quality,
    statementTip: row.statement_tip,
    isAppDefault: row.is_app_default,
    requiresUserKey: !row.is_app_default && !row.supports_default_key,
    isDeprecated: !row.is_active,
    usingUserKey: hasUserKey && !row.is_app_default,
  };
}

export function fallbackModelsFromConstants(keyStatus: KeyStatus): AvailableModel[] {
  const models: AvailableModel[] = [];

  for (const model of AI_MODELS) {
    const providerKey = PROVIDER_KEY_MAP[model.provider as ModelProvider];
    const hasUserKey = keyStatus[providerKey];
    const isAppDefault = "isAppDefault" in model && model.isAppDefault;
    const available = isAppDefault || hasUserKey;

    if (!available) continue;

    models.push({
      id: model.id,
      name: model.name,
      provider: model.provider as ModelProvider,
      description: model.description,
      quality: model.quality,
      statementTip: model.statementTip,
      isAppDefault: Boolean(isAppDefault),
      requiresUserKey: !isAppDefault,
      isDeprecated: false,
      usingUserKey: hasUserKey && !isAppDefault,
    });
  }

  return models;
}

export function resolveAvailableModels(
  catalogRows: CatalogModelRow[],
  keyStatus: KeyStatus,
  preferences: UserModelPreferences,
): AvailableModel[] {
  const base =
    catalogRows.length > 0
      ? catalogRows
          .map((row) => catalogRowToAvailableModel(row, keyStatus))
          .filter((model): model is AvailableModel => model !== null)
      : fallbackModelsFromConstants(keyStatus);

  const visibleIds = preferences.visible_model_ids;
  const filtered =
    visibleIds && visibleIds.length > 0
      ? base.filter((model) => visibleIds.includes(model.id))
      : base;

  return filtered.sort((a, b) => {
    if (a.isAppDefault !== b.isAppDefault) return a.isAppDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function userHasOwnApiKey(keyStatus: KeyStatus): boolean {
  return (
    keyStatus.openai_key ||
    keyStatus.anthropic_key ||
    keyStatus.google_key ||
    keyStatus.grok_key
  );
}

export function getDefaultModelId(
  models: AvailableModel[],
  preferences: UserModelPreferences,
  context?: ModelContext,
  keyStatus?: KeyStatus,
): string {
  const preferred =
    (context && preferences.defaults[context]) ||
    preferences.defaults.global;

  if (
    preferred &&
    models.some((model) => model.id === preferred && !model.isDeprecated)
  ) {
    return preferred;
  }

  if (keyStatus && userHasOwnApiKey(keyStatus)) {
    const userKeyModels = models.filter(
      (model) => model.usingUserKey && !model.isDeprecated,
    );
    if (userKeyModels.length > 0) {
      const excellent = userKeyModels.find((model) => model.quality === "excellent");
      if (excellent) return excellent.id;
      const good = userKeyModels.find((model) => model.quality === "good");
      if (good) return good.id;
      return userKeyModels[0].id;
    }
  }

  const appDefault = models.find((model) => model.isAppDefault);
  if (appDefault) return appDefault.id;

  return models[0]?.id ?? DEFAULT_APP_MODEL_ID;
}

/**
 * Keeps a user's saved model when it is still valid after login.
 * Falls back intelligently for own-key users instead of always using the free default.
 */
export function reconcileModelSelection(
  requestedId: string | undefined,
  models: AvailableModel[],
  defaultModelId: string,
  keyStatus?: KeyStatus,
): string {
  const id = requestedId?.trim();
  if (!id) return defaultModelId;

  if (models.some((model) => model.id === id && !model.isDeprecated)) {
    return id;
  }

  if (keyStatus && isModelAvailableForStatus(id, keyStatus)) {
    return id;
  }

  return defaultModelId;
}

export function isModelAllowed(
  modelId: string,
  models: AvailableModel[],
  keyStatus?: KeyStatus,
): boolean {
  if (models.some((model) => model.id === modelId && !model.isDeprecated)) {
    return true;
  }

  if (keyStatus && isModelAvailableForStatus(modelId, keyStatus)) {
    return true;
  }

  return false;
}

export function mergeDiscoveredModelMetadata(
  discoveredId: string,
  provider: ModelProvider,
  displayName: string,
  description?: string,
) {
  const existing = AI_MODELS.find((model) => model.id === discoveredId);
  return {
    id: discoveredId,
    provider,
    display_name: existing?.name ?? displayName,
    description: existing?.description ?? description ?? "Synced from provider API",
    quality: (existing?.quality ?? "good") as ModelQuality,
    statement_tip:
      existing?.statementTip ??
      "Automatically discovered model. Quality may vary until reviewed.",
    is_app_default: discoveredId === DEFAULT_APP_MODEL_ID,
    supports_default_key: true,
    sort_order: existing ? 0 : 999,
  };
}

export function getProviderEnvKey(provider: ModelProvider): string | null {
  const map: Record<ModelProvider, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
    xai: "XAI_API_KEY",
  };
  const value = process.env[map[provider]];
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function providersWithEnvKeys(): ModelProvider[] {
  return (["openai", "anthropic", "google", "xai"] as ModelProvider[]).filter(
    (provider) => Boolean(getProviderEnvKey(provider)),
  );
}

