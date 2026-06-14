"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, getCharacterCountColor } from "@/lib/utils";
import { MAX_STATEMENT_CHARACTERS, STANDARD_MGAS, RANKS } from "@/lib/constants";
import { Trash2, AlertTriangle, CheckCircle2, Calendar } from "lucide-react";
import type { Rank } from "@/types/database";

export interface ParsedStatement {
  id: string;
  text: string;
  detectedMpa: string | null;
  confidenceScore: number;
  cycleYear: number | null;
  afsc: string;
  rank: Rank;
  needsReview: boolean;
}

interface BulkStatementReviewProps {
  statements: ParsedStatement[];
  extractedDateRange: { start: string; end: string } | null;
  extractedCycleYear: number | null;
  defaultCycleYear: number;
  defaultAfsc: string;
  defaultRank: Rank;
  onStatementsChange: (statements: ParsedStatement[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

const mgas = STANDARD_MGAS.filter(m => m.key !== "hlr_assessment");
const maxChars = MAX_STATEMENT_CHARACTERS;

export function BulkStatementReview({
  statements,
  extractedDateRange,
  extractedCycleYear,
  defaultCycleYear,
  defaultAfsc,
  defaultRank,
  onStatementsChange,
  onBack,
  onSubmit,
  isSubmitting,
}: BulkStatementReviewProps) {
  function updateStatement(id: string, updates: Partial<ParsedStatement>) {
    onStatementsChange(
      statements.map(s => (s.id === id ? { ...s, ...updates } : s))
    );
  }

  function removeStatement(id: string) {
    onStatementsChange(statements.filter(s => s.id !== id));
  }

  function getMpaLabel(key: string | null): string {
    if (!key) return "Not assigned";
    return mgas.find(m => m.key === key)?.label || key;
  }

  const validStatements = statements.filter(
    s => s.text.trim().length > 0 && s.detectedMpa !== null
  );
  const needsReviewCount = statements.filter(s => s.needsReview || !s.detectedMpa).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header with summary */}
      <div className="shrink-0 space-y-3 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">
              {statements.length} statement{statements.length !== 1 ? "s" : ""} detected
            </h3>
            {needsReviewCount > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="size-3 mr-1" />
                {needsReviewCount} need{needsReviewCount === 1 ? "s" : ""} review
              </Badge>
            )}
          </div>
        </div>

        {/* Extracted date range info */}
        {extractedDateRange && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="size-4" />
            <span>
              Period detected: {extractedDateRange.start} - {extractedDateRange.end}
              {extractedCycleYear && ` (Cycle Year: ${extractedCycleYear})`}
            </span>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Review and edit each statement below. Assign MPAs to any statements marked for review.
        </p>
      </div>

      {/* Scrollable statement list */}
      <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
        <div className="space-y-4 py-4">
          {statements.map((statement, index) => (
            <div
              key={statement.id}
              className={cn(
                "p-4 rounded-lg border space-y-3",
                statement.needsReview || !statement.detectedMpa
                  ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10"
                  : "border-border bg-card"
              )}
            >
              {/* Statement header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    #{index + 1}
                  </span>
                  {statement.detectedMpa ? (
                    <Badge
                      variant={statement.confidenceScore >= 0.7 ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {statement.confidenceScore >= 0.7 ? (
                        <CheckCircle2 className="size-3 mr-1" />
                      ) : (
                        <AlertTriangle className="size-3 mr-1" />
                      )}
                      {getMpaLabel(statement.detectedMpa)}
                      {statement.confidenceScore < 0.7 && " (low confidence)"}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="size-3 mr-1" />
                      MPA required
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeStatement(statement.id)}
                  aria-label="Remove statement"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {/* Statement text */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Statement</Label>
                  <span
                    className={cn(
                      "text-xs",
                      getCharacterCountColor(statement.text.length, maxChars)
                    )}
                  >
                    {statement.text.length}/{maxChars}
                  </span>
                </div>
                <Textarea
                  value={statement.text}
                  onChange={(e) => updateStatement(statement.id, { text: e.target.value })}
                  rows={3}
                  className="resize-none text-sm"
                  aria-label={`Statement ${index + 1} text`}
                />
              </div>

              {/* Statement metadata grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* MPA Selector */}
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <Label className="text-xs text-muted-foreground">MPA</Label>
                  <Select
                    value={statement.detectedMpa || ""}
                    onValueChange={(v) =>
                      updateStatement(statement.id, {
                        detectedMpa: v,
                        needsReview: false,
                        confidenceScore: 1.0,
                      })
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        "h-9 text-xs",
                        !statement.detectedMpa && "border-amber-400"
                      )}
                    >
                      <SelectValue placeholder="Select MPA" />
                    </SelectTrigger>
                    <SelectContent>
                      {mgas.map((mpa) => (
                        <SelectItem key={mpa.key} value={mpa.key} className="text-xs">
                          {mpa.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Cycle Year */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Cycle</Label>
                  <Select
                    value={(statement.cycleYear || defaultCycleYear).toString()}
                    onValueChange={(v) =>
                      updateStatement(statement.id, { cycleYear: parseInt(v) })
                    }
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(
                        (year) => (
                          <SelectItem key={year} value={year.toString()} className="text-xs">
                            {year}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Rank */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Rank</Label>
                  <Select
                    value={statement.rank || defaultRank}
                    onValueChange={(v) => updateStatement(statement.id, { rank: v as Rank })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Rank" />
                    </SelectTrigger>
                    <SelectContent>
                      {RANKS.map((rank) => (
                        <SelectItem key={rank.value} value={rank.value} className="text-xs">
                          {rank.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* AFSC */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">AFSC</Label>
                  <Input
                    value={statement.afsc || defaultAfsc}
                    onChange={(e) =>
                      updateStatement(statement.id, { afsc: e.target.value.toUpperCase() })
                    }
                    className="h-9 text-xs uppercase"
                    placeholder="AFSC"
                    aria-label={`Statement ${index + 1} AFSC`}
                  />
                </div>
              </div>
            </div>
          ))}

          {statements.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No statements detected. Try pasting different text or check your input.
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer with actions */}
      <div className="shrink-0 pt-4 border-t flex flex-col sm:flex-row gap-2 sm:justify-between sm:items-center">
        <p className="text-sm text-muted-foreground">
          {validStatements.length} of {statements.length} statement{statements.length !== 1 ? "s" : ""} ready to add
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
            Back to Edit
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isSubmitting || validStatements.length === 0}
          >
            {isSubmitting ? "Adding..." : `Add ${validStatements.length} Statement${validStatements.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
