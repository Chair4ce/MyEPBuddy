"use client";

import { useCallback } from "react";
import {
  useDecorationShellStore,
  HIGHLIGHT_COLORS,
  type BulkStatement,
} from "@/stores/decoration-shell-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { GenerateCitationButton } from "@/components/decoration/generate-citation-button";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import {
  Palette,
  X,
  Trash2,
} from "lucide-react";

interface BulkStatementInputProps {
  className?: string;
  onGenerate?: () => void;
}

/**
 * Splits raw pasted text into individual statements using sentence-boundary
 * heuristics. Statements shorter than 20 characters are discarded.
 */
function parseStatementsLocally(rawText: string): BulkStatement[] {
  const cleaned = rawText
    .replace(/\r\n/g, "\n")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "--")
    .replace(/\u2026/g, "...")
    .trim();

  if (!cleaned) return [];

  const lines = cleaned.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const candidates: string[] = [];

  for (const line of lines) {
    if (/^(EXECUTING THE MISSION|LEADING PEOPLE|MANAGING RESOURCES|IMPROVING THE UNIT|RATER ASSESSMENT)/i.test(line)) {
      continue;
    }
    if (/^[A-Z]{2,4}:\s*$/i.test(line)) continue;

    const parts = line.split(/(?<=\.)\s+(?=[A-Z])/).map((s) => s.trim());
    for (const part of parts) {
      if (part.length >= 20) {
        candidates.push(part);
      }
    }
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const c of candidates) {
    const key = c.toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(c);
    }
  }

  return deduped.map((text, i) => ({
    id: `bulk-${Date.now()}-${i}`,
    text,
  }));
}

export function BulkStatementInput({
  className,
  onGenerate,
}: BulkStatementInputProps) {
  const {
    bulkRawText,
    setBulkRawText,
    bulkStatements,
    setBulkStatements,
    removeBulkStatement,
    clearBulkStatements,
    isBulkParsing,
    setIsBulkParsing,
    statementColors,
    setStatementColor,
    clearStatementColors,
    activeHighlightColor,
    setActiveHighlightColor,
  } = useDecorationShellStore();

  const getColorConfig = (statementId: string) => {
    const colorId = statementColors[statementId];
    if (!colorId) return null;
    return HIGHLIGHT_COLORS.find((c) => c.id === colorId) || null;
  };

  const handleParse = useCallback(() => {
    if (!bulkRawText.trim()) {
      toast.error("Paste some text first");
      return;
    }
    setIsBulkParsing(true);
    try {
      const parsed = parseStatementsLocally(bulkRawText);
      if (parsed.length === 0) {
        toast.error("No statements detected. Make sure each statement is at least 20 characters.");
        return;
      }
      setBulkStatements(parsed);
      toast.success(`${parsed.length} statement${parsed.length !== 1 ? "s" : ""} detected`);
    } finally {
      setIsBulkParsing(false);
    }
  }, [bulkRawText, setBulkStatements, setIsBulkParsing]);

  const coloredCount = bulkStatements.filter((s) => statementColors[s.id]).length;

  // Textarea view (no statements parsed yet) — Generate sends raw text directly
  if (bulkStatements.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Paste Statements</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Paste EPB statements below, then generate a citation
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {onGenerate && (
                <GenerateCitationButton
                  onGenerate={onGenerate}
                  disabled={!bulkRawText.trim()}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Textarea
            value={bulkRawText}
            onChange={(e) => setBulkRawText(e.target.value)}
            placeholder={"Paste your EPB statements here...\n\nEach statement should be at least one full sentence. You can paste an entire EPB section and the parser will detect individual statements.\n\nExample:\nLed 12-member team to deploy $2M network upgrade across 5 sites. Managed 45 work orders valued at $350K, reducing backlog 30%."}
            className="min-h-[calc(100vh-360px)] font-mono text-sm resize-none"
            aria-label="Bulk statement text input"
          />
        </CardContent>
      </Card>
    );
  }

  // Parsed statements view with color pickers and generate button
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Pasted Statements</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Assign colors to track which citation sentences came from which statement
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {bulkStatements.length} statement{bulkStatements.length !== 1 ? "s" : ""}
            </Badge>
            {coloredCount > 0 && (
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
                      This will remove all color assignments from your pasted statements.
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                >
                  <X className="size-3 mr-1" />
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all pasted statements?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all parsed statements and let you paste new text.
                    Any color assignments will also be cleared.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearBulkStatements}>
                    Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {onGenerate && (
              <GenerateCitationButton
                onGenerate={onGenerate}
                disabled={bulkStatements.length === 0}
              />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[calc(100vh-280px)] min-h-[400px] pr-4">
          <div className="space-y-1.5">
            {bulkStatements.map((stmt, index) => {
              const colorConfig = getColorConfig(stmt.id);
              const isActiveColor =
                activeHighlightColor && colorConfig?.id === activeHighlightColor;

              return (
                <div
                  key={stmt.id}
                  className={cn(
                    "flex items-start gap-2.5 p-2 rounded-md transition-all duration-200 border-l-4",
                    "border-l-transparent border border-transparent",
                    !colorConfig && "hover:bg-muted/30",
                    colorConfig && `${colorConfig.bgGlass} ${colorConfig.borderLeft}`,
                    isActiveColor && "ring-1 ring-offset-1 ring-primary/30"
                  )}
                  onMouseEnter={() =>
                    colorConfig && setActiveHighlightColor(colorConfig.id)
                  }
                  onMouseLeave={() => setActiveHighlightColor(null)}
                >
                  <span className="text-xs text-muted-foreground font-mono mt-0.5 shrink-0 w-5 text-right">
                    {index + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed break-words">
                      {stmt.text}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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
                        >
                          <Palette
                            className={cn(
                              "size-3",
                              colorConfig
                                ? colorConfig.textSolid
                                : "text-muted-foreground"
                            )}
                          />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2" align="end">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Highlight color
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {HIGHLIGHT_COLORS.map((color) => (
                              <button
                                key={color.id}
                                type="button"
                                onClick={() =>
                                  setStatementColor(stmt.id, color.id)
                                }
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
                    <button
                      type="button"
                      onClick={() => removeBulkStatement(stmt.id)}
                      className="size-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label="Remove statement"
                    >
                      <Trash2 className="size-3" />
                    </button>
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
