"use client";

import { useRef, useState } from "react";
import { reconcileModelSelection } from "@/lib/ai-models/catalog";
import { type KeyStatus } from "@/app/actions/api-keys";
import { useAvailableModels } from "@/hooks/use-available-models";
import { useCreditsStore } from "@/stores/credits-store";
import { CreditsFirstBanner } from "@/components/billing/credits-first-banner";
import type { ModelContext } from "@/lib/ai-models/types";
import { AI_MODELS, type ModelQuality } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  Key,
  Lock,
  Sparkles,
  Zap,
  CircleAlert,
} from "lucide-react";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  xai: "xAI",
};

const QUALITY_CONFIG: Record<
  ModelQuality,
  { label: string; className: string; icon: typeof Sparkles }
> = {
  excellent: {
    label: "Excellent",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
    icon: Sparkles,
  },
  good: {
    label: "Good",
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
    icon: Zap,
  },
  basic: {
    label: "Basic",
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
    icon: CircleAlert,
  },
};

interface ModelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  context?: ModelContext;
  keyStatus?: KeyStatus | null;
  className?: string;
  compact?: boolean;
}

export function ModelSelector({
  value,
  onValueChange,
  context,
  keyStatus: externalKeyStatus,
  className,
  compact = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const {
    models,
    defaultModelId,
    keyStatus: fetchedKeyStatus,
    creditsFirstActive,
    isLoading,
    error,
    load,
  } = useAvailableModels(context, { eager: true });

  const creditBalance = useCreditsStore((state) => state.balance);
  const keyStatus = externalKeyStatus ?? fetchedKeyStatus;
  const availableModels = models;
  const unavailableModels: typeof models = [];
  const reconcileRef = useRef<string | null>(null);

  const resolvedValue =
    models.length === 0
      ? value
      : reconcileModelSelection(
          value,
          models,
          defaultModelId,
          keyStatus ?? undefined,
        );

  if (models.length > 0) {
    const reconciled = reconcileModelSelection(
      value,
      models,
      defaultModelId,
      keyStatus ?? undefined,
    );
    if (reconciled !== value && reconcileRef.current !== reconciled) {
      reconcileRef.current = reconciled;
      queueMicrotask(() => onValueChange(reconciled));
    }
  }

  const selectedModel = models.find((model) => model.id === resolvedValue);
  const fallbackModelName =
    AI_MODELS.find((model) => model.id === value)?.name ??
    AI_MODELS.find((model) => model.id === resolvedValue)?.name ??
    resolvedValue;

  function handleSelect(modelId: string) {
    if (!models.some((model) => model.id === modelId)) return;
    onValueChange(modelId);
    setOpen(false);
  }

  const selectedQuality = selectedModel
    ? QUALITY_CONFIG[selectedModel.quality]
    : null;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void load();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select AI model"
          className={cn(
            "w-full justify-between font-normal",
            compact ? "h-9" : "h-auto min-h-10 py-2",
            className,
          )}
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" />
              Loading models...
            </span>
          ) : selectedModel || resolvedValue ? (
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <span className="truncate text-sm">
                {selectedModel?.name ?? fallbackModelName}
              </span>
              {selectedQuality && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-5 shrink-0",
                    selectedQuality.className,
                  )}
                >
                  {selectedQuality.label}
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">
              {error ? "Models unavailable" : "Select model..."}
            </span>
          )}
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="z-[100] w-[min(420px,calc(100vw-2rem))] p-0 flex flex-col max-h-[min(480px,calc(100vh-4rem))] overflow-hidden"
        align="start"
      >
        <div className="px-3 py-2.5 border-b shrink-0">
          <p className="text-sm font-medium">Select AI Model</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Models are synced from provider APIs. Customize visibility in{" "}
            <a href="/settings/api-keys" className="text-primary hover:underline">
              My API Keys
            </a>
            .
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-1.5">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Spinner size="sm" />
                Loading models...
              </div>
            ) : models.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted-foreground text-center">
                No models available. Add an API key or refresh the model catalog.
              </p>
            ) : (
              [...availableModels, ...unavailableModels].map((model, index) => {
                const quality = QUALITY_CONFIG[model.quality];
                const QualityIcon = quality.icon;
                const isSelected = resolvedValue === model.id;
                const isFirstUnavailable =
                  unavailableModels.length > 0 && index === availableModels.length;

                return (
                  <div key={model.id}>
                    {isFirstUnavailable && (
                      <div className="my-1.5">
                        <Separator />
                        <p className="text-[11px] text-muted-foreground px-2.5 py-1.5 font-medium">
                          Requires API key
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSelect(model.id)}
                      className={cn(
                        "w-full text-left rounded-md px-2.5 py-2.5 transition-colors",
                        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                        isSelected && "bg-accent",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 shrink-0 w-4">
                          {isSelected ? (
                            <Check className="size-4 text-primary" />
                          ) : model.requiresUserKey && !model.usingUserKey ? (
                            <Lock className="size-3.5 text-muted-foreground" />
                          ) : null}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{model.name}</span>
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] px-1.5 py-0 h-5", quality.className)}
                            >
                              <QualityIcon className="size-2.5 mr-0.5" />
                              {quality.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                              {PROVIDER_LABELS[model.provider]}
                            </Badge>
                            {model.isAppDefault && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                                Free Default
                              </Badge>
                            )}
                            {model.isDeprecated && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                                Deprecated
                              </Badge>
                            )}
                          </div>

                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {model.statementTip}
                          </p>

                          {model.requiresUserKey && !model.usingUserKey && keyStatus && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <Key className="size-3 shrink-0" />
                              <span>
                                Requires {PROVIDER_LABELS[model.provider]} API key —{" "}
                                <a
                                  href="/settings/api-keys"
                                  className="underline hover:text-amber-700 dark:hover:text-amber-300"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  add in Settings
                                </a>
                              </span>
                            </p>
                          )}
                          {model.usingUserKey && (
                            <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                              <Key className="size-3 shrink-0" />
                              Using your API key
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="border-t px-3 py-2.5 bg-muted/30 shrink-0">
          {creditsFirstActive && (creditBalance ?? 0) > 0 ? (
            <CreditsFirstBanner balance={creditBalance ?? 0} compact />
          ) : (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <CircleAlert className="inline-block size-3 align-text-bottom mr-1 text-amber-500" />
              Without your own API key, the app uses the free default (
              {models.find((model) => model.isAppDefault)?.name ?? "Gemini 2.5 Flash Lite"}).
              {" "}
              <a href="/settings/api-keys" className="text-primary hover:underline">
                Add a key
              </a>{" "}
              for premium models.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
