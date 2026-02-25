"use client";

import { useState, useEffect } from "react";
import { useDecorationShellStore } from "@/stores/decoration-shell-store";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type KeyStatus, getKeyStatus } from "@/app/actions/api-keys";
import { AI_MODELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Sparkles, ArrowRight, ChevronDown, Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

const PROVIDER_KEY_MAP: Record<string, keyof KeyStatus> = {
  openai: "openai_key",
  anthropic: "anthropic_key",
  google: "google_key",
  xai: "grok_key",
};

interface GenerateCitationButtonProps {
  onGenerate: () => void;
  disabled?: boolean;
}

export function GenerateCitationButton({
  onGenerate,
  disabled = false,
}: GenerateCitationButtonProps) {
  const {
    isGenerating,
    selectedModel,
    setSelectedModel,
  } = useDecorationShellStore();

  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchKeys() {
      const status = await getKeyStatus();
      if (!cancelled) setKeyStatus(status);
    }
    fetchKeys();
    return () => { cancelled = true; };
  }, []);

  function isModelAvailable(model: (typeof AI_MODELS)[number]): boolean {
    if ("isAppDefault" in model && model.isAppDefault) return true;
    if (!keyStatus) return false;
    const keyName = PROVIDER_KEY_MAP[model.provider];
    return keyName ? keyStatus[keyName] : false;
  }

  return (
    <div className="flex items-center">
      <Button
        variant="default"
        size="sm"
        onClick={onGenerate}
        disabled={isGenerating || disabled}
        className="h-7 px-2.5 text-xs rounded-r-none border-r border-primary-foreground/20"
      >
        {isGenerating ? (
          <>
            <Spinner size="sm" className="mr-1" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="size-3 mr-1" />
            Generate
            <ArrowRight className="size-3 ml-1" />
          </>
        )}
      </Button>
      <Popover open={modelDropdownOpen} onOpenChange={setModelDropdownOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="default"
            size="sm"
            disabled={isGenerating}
            className="h-7 px-1.5 rounded-l-none"
            aria-label="Select AI model"
          >
            <ChevronDown className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[220px] p-1" sideOffset={4}>
          <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            AI Model
          </p>
          {AI_MODELS.map((model) => {
            const available = isModelAvailable(model);
            const isSelected = selectedModel === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  if (available) {
                    setSelectedModel(model.id);
                    setModelDropdownOpen(false);
                  }
                }}
                disabled={!available}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs transition-colors",
                  available
                    ? "hover:bg-accent cursor-pointer"
                    : "opacity-40 cursor-not-allowed",
                  isSelected && "bg-accent"
                )}
              >
                <span className="size-3.5 shrink-0 flex items-center justify-center">
                  {isSelected && <Check className="size-3.5 text-primary" />}
                </span>
                <span className="flex-1 text-left truncate">{model.name}</span>
                {!available && (
                  <span className="text-[10px] text-muted-foreground">Key needed</span>
                )}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}
