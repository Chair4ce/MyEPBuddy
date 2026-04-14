"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Crown,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Circle,
  CheckCircle2,
  Calendar,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { STANDARD_MGAS } from "@/lib/constants";

// Time period filter options — matches the activity feed pattern
const TIME_PERIODS = [
  { value: "all", label: "All Time" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
] as const;

type TimePeriod = (typeof TIME_PERIODS)[number]["value"];

interface Statement {
  id: string;
  mpa: string;
  statement: string;
  created_by: string | null;
  created_at: string;
  rank: string | null;
  afsc: string | null;
  cycle_year: number | null;
}

interface MemberStatementsDialogProps {
  memberId: string;
  memberName: string;
  memberRank: string | null;
  isManagedMember: boolean;
  cycleYear: number;
  currentUserId: string;
  trigger?: React.ReactNode;
}

export function MemberStatementsDialog({
  memberId,
  memberName,
  memberRank,
  isManagedMember,
  cycleYear,
  currentUserId,
  trigger,
}: MemberStatementsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [timePeriodFilter, setTimePeriodFilter] = useState<TimePeriod>("all");
  const [mpaFilter, setMpaFilter] = useState<string>("all");

  const supabase = createClient();

  // Load ALL statements for this member (no cycle_year filter)
  const loadStatements = useCallback(async () => {
    if (!memberId) return;

    setLoading(true);
    try {
      let query = supabase
        .from("refined_statements")
        .select(
          "id, mpa, statement, created_by, created_at, rank, afsc, cycle_year"
        )
        .eq("statement_type", "epb")
        .order("created_at", { ascending: false });

      if (isManagedMember) {
        query = query.eq("team_member_id", memberId);
      } else {
        query = query.eq("user_id", memberId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setStatements(data || []);
    } catch (error) {
      console.error("Failed to load statements:", error);
      toast.error("Failed to load statements");
    } finally {
      setLoading(false);
    }
  }, [memberId, isManagedMember, supabase]);

  useEffect(() => {
    if (open) {
      loadStatements();
    }
  }, [open, loadStatements]);

  // Reset filters when dialog closes
  useEffect(() => {
    if (!open) {
      setTimePeriodFilter("all");
      setMpaFilter("all");
    }
  }, [open]);

  // Client-side filtering by time period and MPA
  const filteredStatements = useMemo(() => {
    let filtered = statements;

    // MPA filter
    if (mpaFilter !== "all") {
      filtered = filtered.filter((s) => s.mpa === mpaFilter);
    }

    // Time period filter
    if (timePeriodFilter !== "all") {
      const now = new Date();
      let startDate: Date;

      switch (timePeriodFilter) {
        case "week":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - now.getDay());
          startDate.setHours(0, 0, 0, 0);
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter": {
          const currentQuarter = Math.floor(now.getMonth() / 3);
          startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
          break;
        }
        case "year":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(0);
      }

      filtered = filtered.filter(
        (s) => new Date(s.created_at) >= startDate
      );
    }

    return filtered;
  }, [statements, timePeriodFilter, mpaFilter]);

  const copyStatement = (statement: string, id: string) => {
    navigator.clipboard.writeText(statement);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Group filtered statements by MPA
  const statementsByMpa = useMemo(
    () =>
      STANDARD_MGAS.reduce(
        (acc, mpa) => {
          acc[mpa.key] = filteredStatements.filter((s) => s.mpa === mpa.key);
          return acc;
        },
        {} as Record<string, Statement[]>
      ),
    [filteredStatements]
  );

  const completedMpas = STANDARD_MGAS.filter(
    (mpa) => statementsByMpa[mpa.key].length > 0
  ).length;

  const hasActiveFilters =
    timePeriodFilter !== "all" || mpaFilter !== "all";

  const clearFilters = () => {
    setTimePeriodFilter("all");
    setMpaFilter("all");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm">
            <FileText className="size-4 mr-2" />
            Statements
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            EPB Statements for {memberRank} {memberName}
          </DialogTitle>
          <DialogDescription>
            {filteredStatements.length} statement
            {filteredStatements.length !== 1 ? "s" : ""} •{" "}
            {completedMpas}/{STANDARD_MGAS.length} MPAs with statements
          </DialogDescription>
        </DialogHeader>

        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Time Period Filter */}
          <Select
            value={timePeriodFilter}
            onValueChange={(v) => setTimePeriodFilter(v as TimePeriod)}
          >
            <SelectTrigger
              className="w-auto min-w-[130px] h-8 text-xs"
              aria-label="Filter by time period"
            >
              <Calendar className="size-3.5 mr-1.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              {TIME_PERIODS.map((period) => (
                <SelectItem key={period.value} value={period.value}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* MPA Filter */}
          <Select
            value={mpaFilter}
            onValueChange={setMpaFilter}
          >
            <SelectTrigger
              className="w-auto min-w-[130px] h-8 text-xs"
              aria-label="Filter by MPA"
            >
              <SelectValue placeholder="All MPAs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All MPAs</SelectItem>
              {STANDARD_MGAS.map((mpa) => (
                <SelectItem key={mpa.key} value={mpa.key}>
                  {mpa.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredStatements.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="size-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {statements.length === 0
                ? "No statements found for this member."
                : "No statements match the current filters."}
            </p>
            {statements.length === 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setOpen(false);
                  window.location.href = "/epb";
                }}
              >
                <ExternalLink className="size-4 mr-2" />
                Generate Statements
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={clearFilters}
              >
                <X className="size-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="all">
                All Statements ({filteredStatements.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {STANDARD_MGAS.map((mpa) => {
                    const mpaStatements = statementsByMpa[mpa.key];
                    const hasStatements = mpaStatements.length > 0;
                    const isHLR = mpa.key === "hlr_assessment";

                    return (
                      <div
                        key={mpa.key}
                        className={cn(
                          "p-4 rounded-lg border",
                          hasStatements
                            ? "bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800"
                            : "bg-muted/30"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {hasStatements ? (
                              <CheckCircle2 className="size-4 text-green-600" />
                            ) : (
                              <Circle className="size-4 text-muted-foreground" />
                            )}
                            {isHLR && (
                              <Crown className="size-4 text-amber-600" />
                            )}
                            <span className="font-medium text-sm">
                              {mpa.label}
                            </span>
                          </div>
                          <Badge
                            variant={hasStatements ? "default" : "secondary"}
                          >
                            {mpaStatements.length} statement
                            {mpaStatements.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>

                        {hasStatements && (
                          <div className="space-y-2 mt-3">
                            {mpaStatements.map((stmt) => (
                              <div
                                key={stmt.id}
                                className="p-3 rounded bg-white dark:bg-gray-900 border text-sm"
                              >
                                <p className="line-clamp-3">{stmt.statement}</p>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t">
                                  <span className="text-xs text-muted-foreground">
                                    {stmt.created_by === currentUserId
                                      ? "Created by you"
                                      : "Created by member"}
                                    {" • "}
                                    {new Date(
                                      stmt.created_at
                                    ).toLocaleDateString()}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7"
                                    onClick={() =>
                                      copyStatement(stmt.statement, stmt.id)
                                    }
                                  >
                                    {copiedId === stmt.id ? (
                                      <Check className="size-3" />
                                    ) : (
                                      <Copy className="size-3" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="all" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {filteredStatements.map((stmt) => {
                    const mpaLabel =
                      STANDARD_MGAS.find((m) => m.key === stmt.mpa)?.label ||
                      stmt.mpa;
                    const isHLR = stmt.mpa === "hlr_assessment";

                    return (
                      <div
                        key={stmt.id}
                        className="p-4 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {isHLR && (
                            <Crown className="size-4 text-amber-600" />
                          )}
                          <Badge variant="outline">{mpaLabel}</Badge>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {stmt.statement.length} chars
                          </span>
                        </div>
                        <p className="text-sm">{stmt.statement}</p>
                        <div className="flex items-center justify-between mt-3 pt-2 border-t">
                          <span className="text-xs text-muted-foreground">
                            {stmt.created_by === currentUserId
                              ? "Created by you"
                              : "Created by member"}
                            {" • "}
                            {new Date(stmt.created_at).toLocaleDateString()}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() =>
                              copyStatement(stmt.statement, stmt.id)
                            }
                          >
                            {copiedId === stmt.id ? (
                              <Check className="size-3 mr-1" />
                            ) : (
                              <Copy className="size-3 mr-1" />
                            )}
                            Copy
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}





