"use client";

import { useMemo } from "react";
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
import { ENTRY_MGAS, MPA_ABBREVIATIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { FileText, X, Palette } from "lucide-react";
import type { Accomplishment } from "@/types/database";

interface DecorationStatementSelectorProps {
  accomplishments: Accomplishment[];
  className?: string;
}

export function DecorationStatementSelector({
  accomplishments,
  className,
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
  } = useDecorationShellStore();
  
  // Get the color config for a statement
  const getColorConfig = (statementId: string) => {
    const colorId = statementColors[statementId];
    if (!colorId) return null;
    return HIGHLIGHT_COLORS.find(c => c.id === colorId) || null;
  };

  // Group accomplishments by MPA
  const groupedAccomplishments = useMemo(() => {
    const groups: Record<string, Accomplishment[]> = {};

    // Initialize all MPA groups
    ENTRY_MGAS.forEach((mpa) => {
      groups[mpa.key] = [];
    });

    // Group accomplishments by MPA
    accomplishments.forEach((acc) => {
      const mpaKey = acc.mpa || "miscellaneous";
      if (!groups[mpaKey]) {
        groups[mpaKey] = [];
      }
      groups[mpaKey].push(acc);
    });

    return groups;
  }, [accomplishments]);

  // Get MPA label
  const getMPALabel = (mpaKey: string) => {
    const mpa = ENTRY_MGAS.find((m) => m.key === mpaKey);
    return mpa?.label || mpaKey;
  };

  // Format accomplishment as display text (show full text, no truncation)
  const formatAccomplishment = (acc: Accomplishment) => {
    return `${acc.action_verb} ${acc.details}`;
  };

  // Count total and selected
  const totalCount = accomplishments.length;
  const selectedCount = selectedStatementIds.length;

  if (totalCount === 0) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <FileText className="size-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No accomplishments found for this member.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add accomplishments to their log to use them in decorations.
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
            <CardTitle className="text-base">Select Accomplishments</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Choose accomplishments to include in the decoration citation
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {selectedCount} / {totalCount} selected
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
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {ENTRY_MGAS.map((mpa) => {
              const mpaAccomplishments = groupedAccomplishments[mpa.key] || [];
              if (mpaAccomplishments.length === 0) return null;

              const selectedInMPA = mpaAccomplishments.filter((a) =>
                selectedStatementIds.includes(a.id)
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
                    {mpaAccomplishments.map((acc) => {
                      const isSelected = selectedStatementIds.includes(acc.id);
                      const colorConfig = getColorConfig(acc.id);
                      const isActiveColor = activeHighlightColor && colorConfig?.id === activeHighlightColor;
                      
                      return (
                        <div
                          key={acc.id}
                          className={cn(
                            "flex items-start gap-2.5 p-2 rounded-md transition-all duration-200",
                            "hover:bg-muted/50",
                            isSelected && !colorConfig && "bg-primary/5 border border-primary/20",
                            colorConfig && `${colorConfig.bg} ${colorConfig.border} border`,
                            isActiveColor && "ring-2 ring-offset-1 ring-primary"
                          )}
                          onMouseEnter={() => colorConfig && setActiveHighlightColor(colorConfig.id)}
                          onMouseLeave={() => setActiveHighlightColor(null)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleStatementSelection(acc.id)}
                            className="mt-0.5"
                            aria-label={`Select accomplishment: ${acc.action_verb} ${acc.details}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm leading-relaxed break-words",
                              colorConfig && colorConfig.text
                            )}>
                              {formatAccomplishment(acc)}
                            </p>
                            {(acc.impact || acc.metrics) && (
                              <div className="flex flex-col gap-0.5 mt-1.5">
                                {acc.impact && (
                                  <span className={cn(
                                    "text-xs break-words",
                                    colorConfig ? colorConfig.text : "text-muted-foreground"
                                  )}>
                                    <span className="font-medium">Impact:</span> {acc.impact}
                                  </span>
                                )}
                                {acc.metrics && (
                                  <span className={cn(
                                    "text-xs break-words",
                                    colorConfig ? colorConfig.text : "text-muted-foreground"
                                  )}>
                                    <span className="font-medium">Metrics:</span> {acc.metrics}
                                  </span>
                                )}
                              </div>
                            )}
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
                                      ? `${colorConfig.bg} ${colorConfig.border} border`
                                      : "border border-dashed border-muted-foreground/50 hover:border-primary hover:bg-muted"
                                  )}
                                  aria-label="Assign highlight color"
                                  tabIndex={isSelected ? 0 : -1}
                                >
                                  <Palette className={cn(
                                    "size-3",
                                    colorConfig ? colorConfig.text : "text-muted-foreground"
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
                                        onClick={() => setStatementColor(acc.id, color.id)}
                                        className={cn(
                                          "size-6 rounded-full border-2 transition-all",
                                          color.bg,
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
                                      onClick={() => setStatementColor(acc.id, null)}
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
