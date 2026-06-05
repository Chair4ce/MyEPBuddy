import { AI_MODELS, DEFAULT_APP_MODEL_ID } from "@/lib/constants";

export const EPB_MODEL_PREFERENCE_STORAGE_KEY = "epb-page-model-preference";
export const AWARD_MODEL_PREFERENCE_STORAGE_KEY = "award-page-model-preference";
export const DECORATION_MODEL_PREFERENCE_STORAGE_KEY = "decoration-page-model-preference";

export type ApiKeyStatus = {
  openai_key: boolean;
  anthropic_key: boolean;
  google_key: boolean;
  grok_key: boolean;
};

export type ProviderKeyName = keyof ApiKeyStatus;

const PROVIDER_KEY_MAP: Record<string, ProviderKeyName> = {
  openai: "openai_key",
  anthropic: "anthropic_key",
  google: "google_key",
  xai: "grok_key",
};

export const KEY_NAME_TO_PROVIDER: Record<ProviderKeyName, string> = {
  openai_key: "openai",
  anthropic_key: "anthropic",
  google_key: "google",
  grok_key: "xai",
};

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  xai: "xAI",
};

export function getModelsForProviderKey(keyName: ProviderKeyName) {
  const provider = KEY_NAME_TO_PROVIDER[keyName];
  return AI_MODELS.filter((model) => model.provider === provider);
}

export function getProviderModelSummary(keyName: ProviderKeyName): string {
  const models = getModelsForProviderKey(keyName);
  if (models.length === 0) return "";
  if (models.length <= 3) {
    return models.map((model) => model.name).join(", ");
  }
  return `${models
    .slice(0, 2)
    .map((model) => model.name)
    .join(", ")}, and ${models.length - 2} more`;
}

export function getUnlockedModels(keyStatus: ApiKeyStatus | null) {
  return AI_MODELS.filter((model) => isModelAvailableForStatus(model.id, keyStatus));
}

export function getAppDefaultModelId(): string {
  const appDefault = AI_MODELS.find((model) => "isAppDefault" in model && model.isAppDefault);
  return appDefault?.id ?? DEFAULT_APP_MODEL_ID;
}

export function isModelAvailableForStatus(
  modelId: string,
  keyStatus: ApiKeyStatus | null,
): boolean {
  const model = AI_MODELS.find((entry) => entry.id === modelId);
  if (!model) return false;

  if ("isAppDefault" in model && model.isAppDefault) return true;
  if (!keyStatus) return false;

  const providerKey = PROVIDER_KEY_MAP[model.provider];
  return providerKey ? keyStatus[providerKey] : false;
}

export function getPreferredDefaultForKeyStatus(
  keyStatus: ApiKeyStatus | null,
): string {
  if (!keyStatus || !Object.values(keyStatus).some(Boolean)) {
    return getAppDefaultModelId();
  }

  const unlocked = getUnlockedModels(keyStatus);
  const paidExcellent = unlocked.find(
    (model) =>
      model.quality === "excellent" &&
      !("isAppDefault" in model && model.isAppDefault),
  );
  if (paidExcellent) return paidExcellent.id;

  const paidModel = unlocked.find(
    (model) => !("isAppDefault" in model && model.isAppDefault),
  );
  if (paidModel) return paidModel.id;

  return getAppDefaultModelId();
}

export function sanitizeStoredModelPreference(
  modelId: string | null | undefined,
  keyStatus?: ApiKeyStatus | null,
): string {
  if (!modelId) {
    return keyStatus
      ? getPreferredDefaultForKeyStatus(keyStatus)
      : getAppDefaultModelId();
  }

  if (keyStatus) {
    if (isModelAvailableForStatus(modelId, keyStatus)) return modelId;
    return getPreferredDefaultForKeyStatus(keyStatus);
  }

  const exists = AI_MODELS.some((model) => model.id === modelId);
  return exists ? modelId : getAppDefaultModelId();
}

export function getStoredModelPreference(storageKey: string): string {
  if (typeof window === "undefined") {
    return getAppDefaultModelId();
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    return sanitizeStoredModelPreference(stored);
  } catch {
    return getAppDefaultModelId();
  }
}

export function setStoredModelPreference(storageKey: string, modelId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, sanitizeStoredModelPreference(modelId));
  } catch {
    // Ignore storage write errors (private mode, quota, etc.)
  }
}
