"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/sonner";
import {
  Loader2,
  Clock,
  Check,
  X,
  Eye,
  Download,
  Calendar,
  FileText,
  AlertTriangle,
} from "lucide-react";
import type { Rank, Accomplishment, RefinedStatement } from "@/types/database";
import { MPA_ABBREVIATIONS } from "@/lib/constants";

interface PendingReview {
  id: string;
  subordinate_id: string;
  supervisor_id: string;
  prior_team_member_id: string;
  entry_count: number;
  statement_count: number;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  resolved_at: string | null;
  supervisor: {
    id: string;
    full_name: string | null;
    rank: Rank | null;
  } | null;
}

export function PendingPriorDataCard() {
  const { profile } = useUserStore();
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);
  const [previewData, setPreviewData] = useState<{
    entries: Accomplishment[];
    statements: RefinedStatement[];
  } | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (!profile?.id) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    void (async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("pending_prior_data_review")
          .select(`
            *,
            supervisor:supervisor_id (
              id,
              full_name,
              rank
            )
          `)
          .eq("subordinate_id", profile!.id)
          .eq("status", "pending")
          .abortSignal(controller.signal);

        if (error) {
          console.error("Error loading pending reviews:", error);
          return;
        }

        if (controller.signal.aborted) return;

        setPendingReviews((data as unknown as PendingReview[]) || []);
      } finally {
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [profile, supabase]);

  const fetchPreviewData = async (review: PendingReview) => {
    setIsFetchingPreview(true);
    setSelectedReview(review);

    try {
      const { data: entries, error: entriesError } = await supabase
        .from("accomplishments")
        .select("*")
        .eq("team_member_id", review.prior_team_member_id)
        .order("date", { ascending: false });

      const { data: statements, error: statementsError } = await supabase
        .from("refined_statements")
        .select("*")
        .eq("team_member_id", review.prior_team_member_id)
        .order("created_at", { ascending: false });

      if (entriesError || statementsError) {
        console.error("Error fetching preview data:", entriesError || statementsError);
        toast.error("Failed to load preview data.");
      } else {
        setPreviewData({
          entries: (entries as Accomplishment[]) || [],
          statements: (statements as RefinedStatement[]) || [],
        });
        setShowPreviewModal(true);
      }
    } catch (error) {
      console.error("Error fetching preview:", error);
      toast.error("Failed to load preview data.");
    } finally {
      setIsFetchingPreview(false);
    }
  };

  const handleAccept = async (review: PendingReview) => {
    setIsProcessing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("accept_prior_data_review", {
        p_review_id: review.id,
      });

      if (error) throw error;

      const result = data as { entries_transferred?: number; statements_transferred?: number };
      toast.success(
        `Imported ${result.entries_transferred || 0} entries and ${result.statements_transferred || 0} statements`
      );

      // Remove from list
      setPendingReviews((prev) => prev.filter((r) => r.id !== review.id));
      setShowPreviewModal(false);
      setSelectedReview(null);
    } catch (error) {
      console.error("Error accepting review:", error);
      toast.error("Failed to accept data");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (review: PendingReview) => {
    setIsProcessing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("reject_prior_data_review", {
        p_review_id: review.id,
      });

      if (error) throw error;

      toast.success("Data declined and removed");

      // Remove from list
      setPendingReviews((prev) => prev.filter((r) => r.id !== review.id));
      setShowPreviewModal(false);
      setSelectedReview(null);
    } catch (error) {
      console.error("Error rejecting review:", error);
      toast.error("Failed to decline data");
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return null;
  }

  if (pendingReviews.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-base">
            <Clock className="size-4 shrink-0" />
            Prior Supervisor Data Review
          </CardTitle>
          <CardDescription className="text-xs">
            Your supervisor created entries/statements for you while you were unlinked. Review and import them.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          {pendingReviews.map((review) => (
            <div
              key={review.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border bg-background"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {review.supervisor?.rank} {review.supervisor?.full_name}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    <FileText className="size-3 mr-1" />
                    {review.entry_count + review.statement_count} items
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {review.entry_count} entries • {review.statement_count} statements
                </p>
              </div>
              
              <div className="flex gap-2 shrink-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchPreviewData(review)}
                        disabled={isFetchingPreview}
                      >
                        {isFetchingPreview && selectedReview?.id === review.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                        <span className="ml-1.5 hidden sm:inline">Preview</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Review the data before importing</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleReject(review)}
                  disabled={isProcessing}
                >
                  <X className="size-4" />
                  <span className="ml-1.5 hidden sm:inline">Decline</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleAccept(review)}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  <span className="ml-1.5 hidden sm:inline">Accept All</span>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Review Prior Supervisor Data</DialogTitle>
            <DialogDescription>
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                <strong className="text-foreground">
                  {selectedReview?.supervisor?.rank} {selectedReview?.supervisor?.full_name}
                </strong>{" "}
                created these while you were unlinked.
              </span>
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="entries" className="flex-grow flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entries">
                Entries ({previewData?.entries.length || 0})
              </TabsTrigger>
              <TabsTrigger value="statements">
                Statements ({previewData?.statements.length || 0})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="entries" className="flex-grow overflow-y-auto mt-4">
              {previewData?.entries.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No entries found.</p>
              ) : (
                <div className="space-y-3">
                  {previewData?.entries.map((entry) => (
                    <div key={entry.id} className="border rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Calendar className="size-3" />
                        <span>{new Date(entry.date).toLocaleDateString()}</span>
                        <Badge variant="secondary" className="text-xs">
                          FY{entry.cycle_year}
                        </Badge>
                        <Badge className="text-xs">
                          {MPA_ABBREVIATIONS[entry.mpa] || entry.mpa}
                        </Badge>
                      </div>
                      <p className="font-medium">
                        {entry.action_verb} {entry.details}
                      </p>
                      {entry.impact && (
                        <p className="text-muted-foreground mt-1">Impact: {entry.impact}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="statements" className="flex-grow overflow-y-auto mt-4">
              {previewData?.statements.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No statements found.</p>
              ) : (
                <div className="space-y-3">
                  {previewData?.statements.map((statement) => (
                    <div key={statement.id} className="border rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Calendar className="size-3" />
                        <span>{new Date(statement.created_at).toLocaleDateString()}</span>
                        <Badge variant="secondary" className="text-xs">
                          FY{statement.cycle_year}
                        </Badge>
                        <Badge className="text-xs">
                          {MPA_ABBREVIATIONS[statement.mpa] || statement.mpa}
                        </Badge>
                      </div>
                      <p>{statement.statement}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowPreviewModal(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => selectedReview && handleReject(selectedReview)}
              disabled={isProcessing}
            >
              <X className="mr-2 size-4" />
              Decline All
            </Button>
            <Button
              onClick={() => selectedReview && handleAccept(selectedReview)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Download className="mr-2 size-4" />
              )}
              Accept & Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

