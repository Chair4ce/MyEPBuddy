"use client";

import { useCallback, useRef, useState } from "react";
import {
  getModelCatalogForSettings,
  saveModelPreferences,
  syncModelCatalog,
} from "@/app/actions/ai-models";
import type {
  AvailableModel,
  CatalogModelRow,
  UserModelPreferences,
} from "@/lib/ai-models/types";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { useAvailableModelsStore } from "@/stores/available-models-store";
import { cn } from "@/lib/utils";
import { Info, KeyRound, Loader2, RefreshCw, Sparkles } from "lucide-react";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  xai: "xAI",
};

interface ModelSettingsFormProps {
  isAdmin: boolean;
  initialAllModels: CatalogModelRow[];
  initialPreferences: UserModelPreferences;
  initialAvailableModels: AvailableModel[];
  initialCatalogSyncedAt: string | null;
}

export function ModelSettingsForm({
  isAdmin,
  initialAllModels,
  initialPreferences,
  initialAvailableModels,
  initialCatalogSyncedAt,
}: ModelSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [allModels, setAllModels] = useState(initialAllModels);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [catalogSyncedAt, setCatalogSyncedAt] = useState(initialCatalogSyncedAt);
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
    setAvailableIds(new Set(data.availableModels.map((model) => model.id)));
  }, []);

  const visibleSet = new Set(
    preferences.visible_model_ids ?? allModels.map((model) => model.id),
  );

  const persistPreferences = useCallback(async (nextPreferences: UserModelPreferences) => {
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
  }, [reloadSettings]);

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

  const providerEntries = Object.entries(grouped);

  return (
    <div className="w-full max-w-3xl space-y-6 pb-10 sm:pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">AI Models</h1>
          <p className="text-muted-foreground">
            Sync the latest models from providers and choose which appear in your pickers.
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
          <div className="flex gap-3">
            <Info className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-2 min-w-0">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Toggle visibility — changes save automatically
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Your picker shows active models you can access. Add provider keys on the{" "}
                <Link href="/settings/api-keys" className="underline hover:text-blue-500">
                  API Keys
                </Link>{" "}
                page to unlock premium models.
                {isAdmin
                  ? " Admins can refresh the catalog manually (rate-limited to once per hour)."
                  : " The catalog syncs automatically once per day."}
              </p>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="details" className="border-blue-200/80 dark:border-blue-900/40">
                  <AccordionTrigger className="py-2 text-xs text-blue-800 dark:text-blue-200 hover:no-underline">
                    More about catalog sync and model selection
                  </AccordionTrigger>
                  <AccordionContent className="text-xs text-blue-700 dark:text-blue-300 space-y-2">
                    <p>
                      The catalog is refreshed from the app&apos;s provider API keys. Deprecated
                      models are marked inactive automatically.
                    </p>
                    <p>
                      <strong className="text-blue-900 dark:text-blue-100">Your own API key:</strong>{" "}
                      unlocks every active model for that provider.
                    </p>
                    <p>
                      <strong className="text-blue-900 dark:text-blue-100">No API key:</strong> only
                      models the shared app key supports, including the free default.
                    </p>
                    <p>
                      On your next visit we keep your last selected model when it is still valid;
                      otherwise we pick the best model for the providers you unlocked.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Model catalog</h2>
          <p className="text-sm text-muted-foreground">
            {allModels.filter((model) => model.is_active).length} active models across{" "}
            {providerEntries.length} providers. Hide models you don&apos;t want in dropdowns.
          </p>
        </div>

        <div className="space-y-4">
          {providerEntries.map(([provider, models]) => (
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
              <CardContent className="space-y-2 pt-0">
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
                        <span className="text-xs text-muted-foreground hidden sm:inline">Show</span>
                        <Switch
                          checked={isVisible}
                          onCheckedChange={(checked) => toggleModelVisibility(model.id, checked)}
                          aria-label={`Show ${model.display_name} in model pickers`}
                          disabled={isUnavailable}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center pt-2">
        Need to add or test provider keys?{" "}
        <Link href="/settings/api-keys" className="text-primary hover:underline">
          Go to API Keys
        </Link>
      </p>
    </div>
  );
}
