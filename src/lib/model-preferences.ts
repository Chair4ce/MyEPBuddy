import { AI_MODELS } from "@/lib/constants";

export const EPB_MODEL_PREFERENCE_STORAGE_KEY = "epb-page-model-preference";
export const AWARD_MODEL_PREFERENCE_STORAGE_KEY = "award-page-model-preference";

export type ApiKeyStatus = {
  openai_key: boolean;
  anthropic_key: boolean;
  google_key: boolean;
  grok_key: boolean;
};

const PROVIDER_KEY_MAP: Record<string, keyof ApiKeyStatus> = {
  openai: "openai_key",
  anthropic: "anthropic_key",
  google: "google_key",
  xai: "grok_key",
};

export function getAppDefaultModelId(): string {
  const appDefault = AI_MODELS.find((model) => "isAppDefault" in model && model.isAppDefault);
  return appDefault?.id ?? "gemini-2.0-flash";
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

export function sanitizeStoredModelPreference(modelId: string | null | undefined): string {
  if (!modelId) return getAppDefaultModelId();
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
