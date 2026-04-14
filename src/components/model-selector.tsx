"use client";

import { useState, useEffect } from "react";
import { AI_MODELS, type ModelQuality } from "@/lib/constants";
import { type KeyStatus, getKeyStatus } from "@/app/actions/api-keys";
import {
  getAppDefaultModelId,
  isModelAvailableForStatus,
} from "@/lib/model-preferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
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

// Map provider to key name in KeyStatus
const PROVIDER_KEY_MAP: Record<string, keyof KeyStatus> = {
  openai: "openai_key",
  anthropic: "anthropic_key",
  google: "google_key",
  xai: "grok_key",
};

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
  /** Optional pre-fetched key status to avoid duplicate calls */
  keyStatus?: KeyStatus | null;
  /** Optional className override for the trigger button */
  className?: string;
  /** Compact mode for tighter UIs like dialogs */
  compact?: boolean;
}

export function ModelSelector({
  value,
  onValueChange,
  keyStatus: externalKeyStatus,
  className,
  compact = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(
    externalKeyStatus ?? null
  );
  const defaultModelId = getAppDefaultModelId();

  // Fetch key status if not provided externally
  useEffect(() => {
    if (externalKeyStatus !== undefined) {
      setKeyStatus(externalKeyStatus);
      return;
    }

    let cancelled = false;
    async function fetchKeys() {
      const status = await getKeyStatus();
      if (!cancelled) setKeyStatus(status);
    }
    fetchKeys();
    return () => {
      cancelled = true;
    };
  }, [externalKeyStatus]);

  const selectedModel = AI_MODELS.find((m) => m.id === value);

  function isModelAvailable(model: (typeof AI_MODELS)[number]): boolean {
    return isModelAvailableForStatus(model.id, keyStatus);
  }

  function handleSelect(modelId: string) {
    const model = AI_MODELS.find((entry) => entry.id === modelId);
    if (!model || !isModelAvailable(model)) return;
    onValueChange(modelId);
    setOpen(false);
  }

  useEffect(() => {
    if (!keyStatus) return;
    if (value === defaultModelId) return;

    if (!isModelAvailableForStatus(value, keyStatus)) {
      onValueChange(defaultModelId);
    }
  }, [defaultModelId, keyStatus, onValueChange, value]);

  const selectedQuality = selectedModel
    ? QUALITY_CONFIG[selectedModel.quality]
    : null;
  const selectedAvailable = selectedModel
    ? isModelAvailable(selectedModel)
    : false;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select AI model"
          className={cn(
            "w-full justify-between font-normal",
            compact ? "h-9" : "h-auto min-h-10 py-2",
            className
          )}
        >
          {selectedModel ? (
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <span className="truncate text-sm">
                {selectedModel.name}
              </span>
              {selectedQuality && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-5 shrink-0",
                    selectedQuality.className
                  )}
                >
                  {selectedQuality.label}
                </Badge>
              )}
              {!selectedAvailable && keyStatus && (
                <Lock className="size-3 text-muted-foreground shrink-0" />
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">
              Select model...
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
            Models with a{" "}
            <Key className="inline-block size-3 align-text-bottom" /> require
            your own API key in{" "}
            <a
              href="/settings/api-keys"
              className="text-primary hover:underline"
            >
              Settings
            </a>
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-1.5">
            {(() => {
              // Sort: available models first, unavailable second
              const availableModels = AI_MODELS.filter((m) => isModelAvailable(m));
              const unavailableModels = AI_MODELS.filter((m) => !isModelAvailable(m));
              const sorted = [...availableModels, ...unavailableModels];

              return sorted.map((model, index) => {
              const available = isModelAvailable(model);
              const quality = QUALITY_CONFIG[model.quality];
              const QualityIcon = quality.icon;
              const isSelected = value === model.id;
              const isDefault =
                "isAppDefault" in model && model.isAppDefault;

              // Show separator between available and unavailable groups
              const isFirstUnavailable =
                !available &&
                index > 0 &&
                isModelAvailable(sorted[index - 1]);

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
                      !available && "opacity-60"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Check / Lock icon */}
                      <div className="mt-0.5 shrink-0 w-4">
                        {isSelected ? (
                          <Check className="size-4 text-primary" />
                        ) : !available ? (
                          <Lock className="size-3.5 text-muted-foreground" />
                        ) : null}
                      </div>

                      {/* Model info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              !available && "text-muted-foreground"
                            )}
                          >
                            {model.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-5",
                              quality.className
                            )}
                          >
                            <QualityIcon className="size-2.5 mr-0.5" />
                            {quality.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5"
                          >
                            {PROVIDER_LABELS[model.provider]}
                          </Badge>
                          {isDefault && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-5"
                            >
                              Free Default
                            </Badge>
                          )}
                        </div>

                        <p
                          className={cn(
                            "text-xs leading-relaxed",
                            available
                              ? "text-muted-foreground"
                              : "text-muted-foreground/70"
                          )}
                        >
                          {model.statementTip}
                        </p>

                        {/* Availability status */}
                        {!available && keyStatus && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Key className="size-3 shrink-0" />
                            <span>
                              Requires{" "}
                              {PROVIDER_LABELS[model.provider]} API key —{" "}
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
                        {available &&
                          !isDefault &&
                          keyStatus?.[
                            PROVIDER_KEY_MAP[model.provider]
                          ] && (
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
            });
            })()}
          </div>
        </div>

        {/* Footer warning about default model */}
        <div className="border-t px-3 py-2.5 bg-muted/30 shrink-0">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <CircleAlert className="inline-block size-3 align-text-bottom mr-1 text-amber-500" />
            Without your own API key, the app defaults to{" "}
            <strong>Gemini 2.0 Flash</strong> which produces basic-quality
            statements.{" "}
            <a
              href="/settings/api-keys"
              className="text-primary hover:underline"
            >
              Add a key
            </a>{" "}
            for better results with premium models.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
