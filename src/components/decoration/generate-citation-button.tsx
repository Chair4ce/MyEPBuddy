"use client";

import { useRef, useState } from "react";
import { reconcileModelSelection } from "@/lib/ai-models/catalog";
import { useDecorationShellStore } from "@/stores/decoration-shell-store";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAvailableModels } from "@/hooks/use-available-models";
import { cn } from "@/lib/utils";
import { Sparkles, ArrowRight, ChevronDown, Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface GenerateCitationButtonProps {
  onGenerate: () => void;
  disabled?: boolean;
}

export function GenerateCitationButton({
  onGenerate,
  disabled = false,
}: GenerateCitationButtonProps) {
  const { isGenerating, selectedModel, setSelectedModel } = useDecorationShellStore();
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const { models, defaultModelId, isLoading, load, keyStatus } = useAvailableModels(
    "decoration",
    { eager: true },
  );
  const reconcileRef = useRef<string | null>(null);

  const resolvedModel =
    models.length === 0
      ? selectedModel
      : reconcileModelSelection(
          selectedModel,
          models,
          defaultModelId,
          keyStatus ?? undefined,
        );

  if (models.length > 0) {
    const reconciled = reconcileModelSelection(
      selectedModel,
      models,
      defaultModelId,
      keyStatus ?? undefined,
    );
    if (reconciled !== selectedModel && reconcileRef.current !== reconciled) {
      reconcileRef.current = reconciled;
      queueMicrotask(() => setSelectedModel(reconciled));
    }
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
      <Popover
        open={modelDropdownOpen}
        onOpenChange={(nextOpen) => {
          setModelDropdownOpen(nextOpen);
          if (nextOpen) void load();
        }}
      >
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
        <PopoverContent align="end" className="w-[240px] p-1" sideOffset={4}>
          <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            AI Model
          </p>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Spinner size="sm" />
              Loading...
            </div>
          ) : (
            models.map((model) => {
              const isSelected = resolvedModel === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    setSelectedModel(model.id);
                    setModelDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs transition-colors hover:bg-accent cursor-pointer",
                    isSelected && "bg-accent",
                  )}
                >
                  <span className="size-3.5 shrink-0 flex items-center justify-center">
                    {isSelected && <Check className="size-3.5 text-primary" />}
                  </span>
                  <span className="flex-1 text-left truncate">{model.name}</span>
                </button>
              );
            })
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
