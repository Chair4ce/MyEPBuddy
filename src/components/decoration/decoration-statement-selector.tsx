"use client";

import { useMemo, useState, useEffect } from "react";
import { useDecorationShellStore, HIGHLIGHT_COLORS, type HighlightColorId } from "@/stores/decoration-shell-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ENTRY_MGAS, MPA_ABBREVIATIONS, AI_MODELS } from "@/lib/constants";
import { type KeyStatus, getKeyStatus } from "@/app/actions/api-keys";
import { cn } from "@/lib/utils";
import { FileText, X, Palette, Sparkles, ArrowRight, ChevronDown, Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { RefinedStatement } from "@/types/database";

// Map provider to key name in KeyStatus
const PROVIDER_KEY_MAP: Record<string, keyof KeyStatus> = {
  openai: "openai_key",
  anthropic: "anthropic_key",
  google: "google_key",
  xai: "grok_key",
};

interface DecorationStatementSelectorProps {
  statements: RefinedStatement[];
  className?: string;
  onGenerate?: () => void;
}

export function DecorationStatementSelector({
  statements,
  className,
  onGenerate,
}: DecorationStatementSelectorProps) {
  const { 
    selectedStatementIds, 
    toggleStatementSelection, 
    clearSelectedStatements,
    statementColors,
    setStatementColor,
    clearStatementColors,
    activeHighlightColor,
    setActiveHighlightColor,
    isGenerating,
    selectedModel,
    setSelectedModel,
  } = useDecorationShellStore();

  // Model dropdown state
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

  const currentModel = AI_MODELS.find((m) => m.id === selectedModel);

  function isModelAvailable(model: (typeof AI_MODELS)[number]): boolean {
    if ("isAppDefault" in model && model.isAppDefault) return true;
    if (!keyStatus) return false;
    const keyName = PROVIDER_KEY_MAP[model.provider];
    return keyName ? keyStatus[keyName] : false;
  }
  
  // Get the color config for a statement
  const getColorConfig = (statementId: string) => {
    const colorId = statementColors[statementId];
    if (!colorId) return null;
    return HIGHLIGHT_COLORS.find(c => c.id === colorId) || null;
  };

  // Group statements by MPA
  const groupedStatements = useMemo(() => {
    const groups: Record<string, RefinedStatement[]> = {};

    // Initialize all MPA groups
    ENTRY_MGAS.forEach((mpa) => {
      groups[mpa.key] = [];
    });

    // Group statements by MPA
    statements.forEach((stmt) => {
      const mpaKey = stmt.mpa || "miscellaneous";
      if (!groups[mpaKey]) {
        groups[mpaKey] = [];
      }
      groups[mpaKey].push(stmt);
    });

    return groups;
  }, [statements]);

  // Get MPA label
  const getMPALabel = (mpaKey: string) => {
    const mpa = ENTRY_MGAS.find((m) => m.key === mpaKey);
    return mpa?.label || mpaKey;
  };

  // Count total and selected
  const totalCount = statements.length;
  const selectedCount = selectedStatementIds.length;

  if (totalCount === 0) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <FileText className="size-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No finalized statements found for this member.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Save statements from EPBs or the statements library to use them in decorations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Select EPB Statements</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Choose statements to include in the decoration citation
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {selectedCount} selected
            </Badge>
            {Object.keys(statementColors).length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                  >
                    <Palette className="size-3 mr-1" />
                    Clear colors
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all highlight colors?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all color assignments from your selected statements. 
                      You can always re-assign colors afterward.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={clearStatementColors}>
                      Clear Colors
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {selectedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelectedStatements}
                className="h-7 px-2 text-xs"
              >
                <X className="size-3 mr-1" />
                Clear
              </Button>
            )}
            {onGenerate && (
              <div className="flex items-center">
                {/* Generate action */}
                <Button
                  variant="default"
                  size="sm"
                  onClick={onGenerate}
                  disabled={isGenerating || selectedCount === 0}
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
                {/* Model selector dropdown */}
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
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[calc(100vh-280px)] min-h-[400px] pr-4">
          <div className="space-y-4">
            {ENTRY_MGAS.map((mpa) => {
              const mpaStatements = groupedStatements[mpa.key] || [];
              if (mpaStatements.length === 0) return null;

              const selectedInMPA = mpaStatements.filter((s) =>
                selectedStatementIds.includes(s.id)
              ).length;

              return (
                <div key={mpa.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-medium">
                      {MPA_ABBREVIATIONS[mpa.key] || mpa.key}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {mpa.label}
                    </span>
                    {selectedInMPA > 0 && (
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        {selectedInMPA} selected
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1.5 pl-2">
                    {mpaStatements.map((stmt) => {
                      const isSelected = selectedStatementIds.includes(stmt.id);
                      const colorConfig = getColorConfig(stmt.id);
                      const isActiveColor = activeHighlightColor && colorConfig?.id === activeHighlightColor;
                      
                      return (
                        <div
                          key={stmt.id}
                          className={cn(
                            "flex items-start gap-2.5 p-2 rounded-md transition-all duration-200 border-l-4",
                            // Default state
                            "border-l-transparent border border-transparent",
                            // Hover state (only when no color assigned)
                            !colorConfig && "hover:bg-muted/30",
                            // Selected but no color
                            isSelected && !colorConfig && "bg-primary/5 border-primary/20 border-l-primary/50",
                            // Color assigned: glass-style transparent bg + colored left border
                            colorConfig && `${colorConfig.bgGlass} ${colorConfig.borderLeft}`,
                            // Active/hovered matching color - subtle ring
                            isActiveColor && "ring-1 ring-offset-1 ring-primary/30"
                          )}
                          onMouseEnter={() => colorConfig && setActiveHighlightColor(colorConfig.id)}
                          onMouseLeave={() => setActiveHighlightColor(null)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleStatementSelection(stmt.id)}
                            className="mt-0.5"
                            aria-label={`Select statement: ${stmt.statement}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-relaxed break-words">
                              {stmt.statement}
                            </p>
                            {/* Show cycle year and type as metadata */}
                            <div className="flex items-center gap-2 mt-1">
                              <Badge 
                                variant="outline" 
                                className="text-[10px]"
                              >
                                {stmt.cycle_year}
                              </Badge>
                              {stmt.is_favorite && (
                                <Badge 
                                  variant="secondary" 
                                  className="text-[10px]"
                                >
                                  Favorite
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {/* Color picker - always present for layout stability, visible only when selected */}
                          <div className={cn(
                            "shrink-0 transition-opacity duration-200",
                            isSelected ? "opacity-100" : "opacity-0 pointer-events-none"
                          )}>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className={cn(
                                    "size-6 rounded flex items-center justify-center transition-colors",
                                    colorConfig 
                                      ? `${colorConfig.bgSolid} ${colorConfig.border} border`
                                      : "border border-dashed border-muted-foreground/50 hover:border-primary hover:bg-muted"
                                  )}
                                  aria-label="Assign highlight color"
                                  tabIndex={isSelected ? 0 : -1}
                                >
                                  <Palette className={cn(
                                    "size-3",
                                    colorConfig ? colorConfig.textSolid : "text-muted-foreground"
                                  )} />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-2" align="end">
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground">Highlight color</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {HIGHLIGHT_COLORS.map((color) => (
                                      <button
                                        key={color.id}
                                        type="button"
                                        onClick={() => setStatementColor(stmt.id, color.id)}
                                        className={cn(
                                          "size-6 rounded-full border-2 transition-all",
                                          color.bgSolid,
                                          colorConfig?.id === color.id 
                                            ? "ring-2 ring-offset-1 ring-primary border-primary" 
                                            : "border-transparent hover:scale-110"
                                        )}
                                        aria-label={`Set ${color.label} highlight`}
                                      />
                                    ))}
                                  </div>
                                  {colorConfig && (
                                    <button
                                      type="button"
                                      onClick={() => setStatementColor(stmt.id, null)}
                                      className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                                    >
                                      Remove color
                                    </button>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
