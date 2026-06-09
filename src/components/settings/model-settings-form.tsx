"use client";

import { useCallback, useRef, useState } from "react";
import {
  getModelCatalogForSettings,
  saveModelPreferences,
  syncModelCatalog,
} from "@/app/actions/ai-models";
import {
  deleteApiKey,
  saveApiKey,
  type KeyName,
  type KeyStatus,
} from "@/app/actions/api-keys";
import type {
  AvailableModel,
  CatalogModelRow,
  ModelProvider,
  UserModelPreferences,
} from "@/lib/ai-models/types";
import { Analytics } from "@/lib/analytics";
import { KEY_NAME_TO_PROVIDER } from "@/lib/model-preferences";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { useAvailableModelsStore } from "@/stores/available-models-store";
import { cn } from "@/lib/utils";
import { KeyRound, Loader2, RefreshCw, Shield, Sparkles } from "lucide-react";
import {
  PROVIDER_KEY_CONFIGS,
  ProviderKeySection,
} from "@/components/settings/provider-key-section";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  xai: "xAI",
};

const PROVIDER_ORDER: ModelProvider[] = ["openai", "anthropic", "google", "xai"];

interface ModelSettingsFormProps {
  isAdmin: boolean;
  initialAllModels: CatalogModelRow[];
  initialPreferences: UserModelPreferences;
  initialAvailableModels: AvailableModel[];
  initialCatalogSyncedAt: string | null;
  initialKeyStatus: KeyStatus;
}

export function ModelSettingsForm({
  isAdmin,
  initialAllModels,
  initialPreferences,
  initialAvailableModels,
  initialCatalogSyncedAt,
  initialKeyStatus,
}: ModelSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [allModels, setAllModels] = useState(initialAllModels);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [catalogSyncedAt, setCatalogSyncedAt] = useState(initialCatalogSyncedAt);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>(initialKeyStatus);
  const [availableIds, setAvailableIds] = useState(
    new Set(initialAvailableModels.map((model) => model.id)),
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPreferencesRef = useRef<UserModelPreferences | null>(null);
  const saveSeqRef = useRef(0);

  const reloadSettings = useCallback(async () => {
    const data = await getModelCatalogForSettings();
    setAllModels(data.allModels);
    setPreferences(data.preferences);
    setCatalogSyncedAt(data.catalogSyncedAt);
    setKeyStatus(data.keyStatus);
    setAvailableIds(new Set(data.availableModels.map((model) => model.id)));
  }, []);

  const visibleSet = new Set(
    preferences.visible_model_ids ?? allModels.map((model) => model.id),
  );

  const persistPreferences = useCallback(
    async (nextPreferences: UserModelPreferences) => {
      const seq = ++saveSeqRef.current;
      setIsSaving(true);

      try {
        const result = await saveModelPreferences(nextPreferences);
        if (seq !== saveSeqRef.current) return;

        if (!result.success) {
          toast.error(result.error || "Failed to save model preference");
          await reloadSettings();
          return;
        }

        useAvailableModelsStore.getState().invalidate();
      } catch {
        if (seq !== saveSeqRef.current) return;
        toast.error("Failed to save model preference");
        await reloadSettings();
      } finally {
        if (seq === saveSeqRef.current) {
          setIsSaving(false);
        }
      }
    },
    [reloadSettings],
  );

  const scheduleSave = useCallback(
    (nextPreferences: UserModelPreferences) => {
      pendingPreferencesRef.current = nextPreferences;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        const pending = pendingPreferencesRef.current;
        if (!pending) return;
        void persistPreferences(pending);
      }, 300);
    },
    [persistPreferences],
  );

  function buildNextPreferences(
    current: UserModelPreferences,
    modelId: string,
    checked: boolean,
  ): UserModelPreferences {
    const baseIds =
      current.visible_model_ids ?? allModels.map((model) => model.id);
    const next = checked
      ? Array.from(new Set([...baseIds, modelId]))
      : baseIds.filter((id) => id !== modelId);

    return {
      ...current,
      visible_model_ids: next.length === allModels.length ? null : next,
    };
  }

  function toggleModelVisibility(modelId: string, checked: boolean) {
    let nextPreferences: UserModelPreferences | null = null;

    setPreferences((current) => {
      nextPreferences = buildNextPreferences(current, modelId, checked);
      return nextPreferences;
    });

    if (nextPreferences) {
      scheduleSave(nextPreferences);
    }
  }

  async function handleSaveKey(keyName: KeyName, keyValue: string) {
    const result = await saveApiKey(keyName, keyValue);
    if (result.success) {
      setKeyStatus((prev) => ({ ...prev, [keyName]: true }));
      Analytics.apiKeyAdded(keyName);
      toast.success("API key saved successfully");
      await reloadSettings();
    } else {
      toast.error(result.error || "Failed to save API key");
    }
  }

  async function handleDeleteKey(keyName: KeyName) {
    const result = await deleteApiKey(keyName);
    if (result.success) {
      setKeyStatus((prev) => ({ ...prev, [keyName]: false }));
      Analytics.apiKeyRemoved(keyName);
      toast.success("API key deleted");
      await reloadSettings();
    } else {
      toast.error(result.error || "Failed to delete API key");
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      const result = await syncModelCatalog();
      if (!result.success) {
        toast.error(result.error || "Failed to sync model catalog");
        return;
      }
      useAvailableModelsStore.getState().invalidate();
      toast.success(
        `Synced ${result.syncedCount} models${result.deprecatedCount > 0 ? `, deprecated ${result.deprecatedCount}` : ""}`,
      );
      await reloadSettings();
    } finally {
      setIsSyncing(false);
    }
  }

  const grouped = allModels.reduce<Record<string, CatalogModelRow[]>>((acc, model) => {
    acc[model.provider] = acc[model.provider] ?? [];
    acc[model.provider].push(model);
    return acc;
  }, {});

  const keyConfigByProvider = Object.fromEntries(
    PROVIDER_KEY_CONFIGS.map((config) => [KEY_NAME_TO_PROVIDER[config.key], config]),
  );

  return (
    <div className="w-full max-w-3xl space-y-6 pb-10 sm:pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">My API Keys</h1>
          <p className="text-muted-foreground">
            Add your API keys, test them, and choose which models appear in your dropdowns.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
            {catalogSyncedAt && (
              <p className="text-xs text-muted-foreground">
                Last sync: {new Date(catalogSyncedAt).toLocaleString()}
              </p>
            )}
            {isSaving && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                Saving changes...
              </p>
            )}
          </div>
        </div>
        {isAdmin ? (
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={isSyncing}
            className="shrink-0 self-start"
            aria-label="Refresh model catalog from providers"
          >
            {isSyncing ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="size-4 mr-2" />
            )}
            Refresh catalog
          </Button>
        ) : null}
      </div>

      <Card className="border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="py-4">
          <div className="flex gap-2.5 items-start">
            <Shield className="size-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-blue-800 dark:text-blue-200 leading-snug">
              Keys are encrypted and used server-side only — never shown in your browser. Rotate them
              regularly: delete the old key here, then save a new one from your provider.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {PROVIDER_ORDER.map((provider) => {
          const models = grouped[provider];
          if (!models?.length) return null;

          const keyConfig = keyConfigByProvider[provider];
          const providerKeyName = keyConfig?.key;
          const hasKey = providerKeyName ? keyStatus[providerKeyName] : false;

          return (
            <Card key={provider}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <span>{PROVIDER_LABELS[provider] ?? provider}</span>
                    <CardDescription className="mt-0.5">
                      {models.filter((model) => model.is_active).length} active ·{" "}
                      {models.filter((model) => !model.is_active).length} deprecated
                    </CardDescription>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {keyConfig && providerKeyName ? (
                  <ProviderKeySection
                    provider={keyConfig}
                    hasKey={hasKey}
                    onSave={(key) => handleSaveKey(providerKeyName, key)}
                    onDelete={() => handleDeleteKey(providerKeyName)}
                  />
                ) : null}

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium">Model visibility</p>
                  <p className="text-xs text-muted-foreground">
                    Toggle which models from this provider appear in your pickers.
                  </p>
                  {models.map((model) => {
                    const canUse = availableIds.has(model.id);
                    const isVisible = visibleSet.has(model.id);
                    const isUnavailable = !canUse && !model.is_app_default;

                    return (
                      <div
                        key={model.id}
                        className={cn(
                          "flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors",
                          !model.is_active && "opacity-60",
                          isUnavailable && "bg-muted/30",
                        )}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{model.display_name}</p>
                            {model.is_app_default && (
                              <Badge variant="secondary" className="text-[10px]">
                                Free default
                              </Badge>
                            )}
                            {!model.is_active && (
                              <Badge variant="outline" className="text-[10px]">
                                Deprecated
                              </Badge>
                            )}
                            {isUnavailable && model.is_active && (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <KeyRound className="size-2.5" aria-hidden="true" />
                                Key required
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {model.description}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono truncate">
                            {model.id}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pt-0.5">
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            Show
                          </span>
                          <Switch
                            checked={isVisible}
                            onCheckedChange={(checked) =>
                              toggleModelVisibility(model.id, checked)
                            }
                            aria-label={`Show ${model.display_name} in model pickers`}
                            disabled={isUnavailable}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Add and test a provider key above, then toggle which models from that provider appear in
            your dropdowns. Refresh the catalog when providers release new models.
          </p>
          <p>When you generate statements, the app checks if you have a key for the provider:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong className="text-foreground">With your key:</strong> Your key is used for any
              enabled model from that provider (Generate, Award, EPB, and Library workspace)
            </li>
            <li>
              <strong className="text-foreground">Without your key:</strong> The app&apos;s shared
              default model is used (limited free usage)
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
