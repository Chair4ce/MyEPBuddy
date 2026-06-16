"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  FileText,
  Trash2,
  Eye,
  Clock,
  FolderOpen,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";

interface WARReportCategory {
  key: string;
  label: string;
  items: string[];
}

interface SavedWARReport {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  title: string | null;
  unit_office_symbol: string | null;
  prepared_by: string;
  content: { categories: WARReportCategory[] };
  entry_count: number;
  model_used: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface WARHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewReport: (report: SavedWARReport) => void;
}

export function WARHistoryModal({
  open,
  onOpenChange,
  onViewReport,
}: WARHistoryModalProps) {
  const supabase = createClient();
  const { profile } = useUserStore();

  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<SavedWARReport[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load reports on open
  useEffect(() => {
    async function loadReports() {
      if (!open || !profile) return;

      setIsLoading(true);
      try {
        const { data, error } = await (supabase
          .from("war_reports") as any)
          .select("*")
          .eq("user_id", profile.id)
          .order("week_start", { ascending: false })
          .limit(100);

        if (error) {
          console.error("Error loading WAR reports:", error);
          toast.error("Failed to load reports");
          return;
        }

        setReports(data || []);
      } catch (error) {
        console.error("Error loading WAR reports:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadReports();
  }, [open, profile, supabase]);

  // Filter reports by search query
  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;

    const query = searchQuery.toLowerCase();
    return reports.filter((report) => {
      // Search in date range
      const weekStart = new Date(report.week_start).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const weekEnd = new Date(report.week_end).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      if (weekStart.toLowerCase().includes(query) || weekEnd.toLowerCase().includes(query)) {
        return true;
      }

      // Search in unit/office symbol
      if (report.unit_office_symbol?.toLowerCase().includes(query)) {
        return true;
      }

      // Search in title
      if (report.title?.toLowerCase().includes(query)) {
        return true;
      }

      // Search in content (bullet items)
      const contentText = report.content.categories
        .flatMap((cat) => cat.items)
        .join(" ")
        .toLowerCase();
      if (contentText.includes(query)) {
        return true;
      }

      return false;
    });
  }, [reports, searchQuery]);

  // Format date range for display
  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startStr = startDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const endStr = endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startStr} - ${endStr}`;
  };

  // Get week number from date
  const getWeekNumber = (dateStr: string) => {
    const date = new Date(dateStr);
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return week;
  };

  // Delete report
  const handleDelete = async () => {
    if (!deleteReportId) return;

    setIsDeleting(true);
    try {
      const { error } = await (supabase
        .from("war_reports") as any)
        .delete()
        .eq("id", deleteReportId);

      if (error) throw error;

      setReports((prev) => prev.filter((r) => r.id !== deleteReportId));
      toast.success("WAR deleted");
    } catch (error) {
      console.error("Error deleting WAR:", error);
      toast.error("Failed to delete WAR");
    } finally {
      setIsDeleting(false);
      setDeleteReportId(null);
    }
  };

  // Copy report to clipboard
  const handleCopy = async (report: SavedWARReport) => {
    try {
      const lines: string[] = [];
      
      lines.push("WEEKLY ACTIVITY REPORT");
      lines.push(`Date: ${formatDateRange(report.week_start, report.week_end)}`);
      if (report.unit_office_symbol) {
        lines.push(`Unit: ${report.unit_office_symbol}`);
      }
      lines.push(`Prepared by: ${report.prepared_by}`);
      lines.push("");
      lines.push("=".repeat(50));
      lines.push("");

      report.content.categories.forEach((category) => {
        lines.push(category.label.toUpperCase());
        lines.push("-".repeat(category.label.length));
        if (category.items.length > 0) {
          category.items.forEach((item) => {
            lines.push(`• ${item}`);
          });
        } else {
          lines.push("• No items for this category");
        }
        lines.push("");
      });

      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedId(report.id);
      toast.success("WAR copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  // Handle view report
  const handleView = (report: SavedWARReport) => {
    onOpenChange(false);
    onViewReport(report);
  };

  // Group reports by month/year for better organization
  const groupedReports = useMemo(() => {
    const groups: { key: string; label: string; reports: SavedWARReport[] }[] = [];
    const groupMap = new Map<string, SavedWARReport[]>();

    filteredReports.forEach((report) => {
      const date = new Date(report.week_start);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(report);
    });

    // Convert to array and sort by key (most recent first)
    Array.from(groupMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .forEach(([key, reports]) => {
        const date = new Date(reports[0].week_start);
        const label = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        groups.push({ key, label, reports });
      });

    return groups;
  }, [filteredReports]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl !max-h-[85vh] !flex !flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="size-5" />
              WAR History
            </DialogTitle>
            <DialogDescription>
              View and manage your saved Weekly Activity Reports
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative px-6 pt-4 shrink-0">
            <Search className="absolute left-9 top-1/2 -translate-y-1/2 size-4 text-muted-foreground mt-2" />
            <Input
              placeholder="Search reports by date, content, or unit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              aria-label="Search WAR reports"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 px-6">
              <Spinner size="lg" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <FileText className="size-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No Saved Reports</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Generate and save WAR reports from the Weekly view to see them here.
              </p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Search className="size-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No Results Found</h3>
              <p className="text-sm text-muted-foreground">
                Try a different search term
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6">
              <div className="space-y-6 py-4 pb-4">
                {groupedReports.map((group) => (
                  <div key={group.key}>
                    {/* Month/Year Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium text-muted-foreground">
                        {group.label}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                      <Badge variant="secondary" className="text-xs">
                        {group.reports.length} {group.reports.length === 1 ? "report" : "reports"}
                      </Badge>
                    </div>

                    {/* Reports */}
                    <div className="space-y-2">
                      {group.reports.map((report) => {
                        const weekNum = getWeekNumber(report.week_start);
                        const bulletCount = report.content.categories.reduce(
                          (sum, cat) => sum + cat.items.length,
                          0
                        );
                        const isCopied = copiedId === report.id;

                        return (
                          <Card
                            key={report.id}
                            className="group hover:bg-muted/50 transition-colors"
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  {/* Week Badge */}
                                  <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                                    W{weekNum}
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-medium text-sm">
                                        Week of {formatDateRange(report.week_start, report.week_end)}
                                      </p>
                                      {report.unit_office_symbol && (
                                        <Badge variant="outline" className="text-xs">
                                          {report.unit_office_symbol}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <FileText className="size-3" />
                                        {bulletCount} bullets
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Clock className="size-3" />
                                        {new Date(report.updated_at).toLocaleDateString()}
                                      </span>
                                    </div>

                                    {/* Preview of first bullet */}
                                    {bulletCount > 0 && (
                                      <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                                        • {report.content.categories.find((c) => c.items.length > 0)?.items[0]}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => handleView(report)}
                                    aria-label="View report"
                                  >
                                    <Eye className="size-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => handleCopy(report)}
                                    aria-label="Copy report"
                                  >
                                    {isCopied ? (
                                      <Check className="size-4 text-green-500" />
                                    ) : (
                                      <Copy className="size-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-destructive hover:text-destructive"
                                    onClick={() => setDeleteReportId(report.id)}
                                    aria-label="Delete report"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 px-6 pb-6 border-t shrink-0 bg-background">
            <p className="text-xs text-muted-foreground">
              {filteredReports.length} of {reports.length} reports
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteReportId} onOpenChange={() => setDeleteReportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete WAR Report?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The report will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
