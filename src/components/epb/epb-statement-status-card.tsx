"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { STANDARD_MGAS, MPA_ABBREVIATIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  FileText,
  Check,
  Copy,
  Crown,
  MessageSquare,
  Send,
  Loader2,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface EPBStatementStatusCardProps {
  profileId: string;
  selectedUser: string;
  isManagedMember: boolean;
  managedMemberId: string | null;
  cycleYear: number;
  className?: string;
  title?: string;
}

export function EPBStatementStatusCard({
  profileId,
  selectedUser,
  isManagedMember,
  managedMemberId,
  cycleYear,
  className,
  title = "EPB Progress",
}: EPBStatementStatusCardProps) {
  const supabase = createClient();

  // State
  const [mpaStatements, setMpaStatements] = useState<
    Record<string, { statement: string; created_by: string | null }[]>
  >({});
  const [expandedMpas, setExpandedMpas] = useState<Record<string, boolean>>({});
  const [loadingStatements, setLoadingStatements] = useState(false);
  const [copiedMpa, setCopiedMpa] = useState<string | null>(null);

  // Feedback dialog state
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [feedbackQ1, setFeedbackQ1] = useState("");
  const [feedbackQ2, setFeedbackQ2] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Load MPA statements
  const loadMpaStatements = useCallback(async () => {
    if (!profileId) return;

    setLoadingStatements(true);

    try {
      let query = supabase
        .from("refined_statements")
        .select("mpa, statement, created_by")
        .eq("cycle_year", cycleYear)
        .eq("statement_type", "epb");

      if (isManagedMember && managedMemberId) {
        query = query.eq("team_member_id", managedMemberId);
      } else {
        const targetUserId = selectedUser === "self" ? profileId : selectedUser;
        query = query.eq("user_id", targetUserId);
      }

      const { data } = (await query) as {
        data: { mpa: string; statement: string; created_by: string | null }[] | null;
      };

      const grouped: Record<string, { statement: string; created_by: string | null }[]> = {};
      STANDARD_MGAS.forEach((mpa) => {
        grouped[mpa.key] = [];
      });

      if (data) {
        data.forEach((row) => {
          if (grouped[row.mpa]) {
            grouped[row.mpa].push({ statement: row.statement, created_by: row.created_by });
          }
        });
      }

      setMpaStatements(grouped);
    } catch (error) {
      console.error("Error loading statements:", error);
    } finally {
      setLoadingStatements(false);
    }
  }, [profileId, selectedUser, isManagedMember, managedMemberId, cycleYear, supabase]);

  useEffect(() => {
    loadMpaStatements();
  }, [loadMpaStatements]);

  // Feedback submission
  async function handleSubmitFeedback() {
    if (!feedbackQ1.trim() && !feedbackQ2.trim()) {
      toast.error("Please answer at least one question");
      return;
    }

    setIsSubmittingFeedback(true);

    try {
      const combinedFeedback = [
        feedbackQ1.trim() ? `Q1: ${feedbackQ1.trim()}` : "",
        feedbackQ2.trim() ? `Q2: ${feedbackQ2.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("user_feedback").insert({
        user_id: profileId,
        feature: "epb_status_tracking",
        feedback: combinedFeedback,
      });

      if (error) throw error;

      toast.success("Thank you for your feedback!");
      setShowFeedbackDialog(false);
      setFeedbackQ1("");
      setFeedbackQ2("");
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast.error("Failed to submit feedback");
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  // Get selected MPA for detail view
  const selectedMpaForView = Object.keys(expandedMpas).find((k) => expandedMpas[k]) || null;
  const selectedMpaStatements = selectedMpaForView ? mpaStatements[selectedMpaForView] || [] : [];
  const selectedMpaLabel = selectedMpaForView
    ? STANDARD_MGAS.find((m) => m.key === selectedMpaForView)?.label
    : null;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4" />
              {title}
            </CardTitle>
            <CardDescription className="text-xs">
              {cycleYear} Cycle •{" "}
              {Object.values(mpaStatements).filter((s) => s.length > 0).length}/
              {STANDARD_MGAS.length} MPAs complete
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {loadingStatements && <Badge variant="secondary" className="text-xs">Loading...</Badge>}
            <Dialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5">
                  <MessageSquare className="size-3.5" />
                  <span className="hidden sm:inline">Feedback</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <MessageSquare className="size-5" />
                    EPB Tracking Feedback
                  </DialogTitle>
                  <DialogDescription>
                    Help us improve EPB tracking. Your answers shape how we build this feature.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="feedback-q1" className="text-sm font-medium">
                      1. What is the most important thing about tracking the status of your EPB or
                      your subordinates&apos; EPB?
                    </Label>
                    <Textarea
                      id="feedback-q1"
                      placeholder="e.g., Knowing what's left to write, seeing deadlines, tracking team progress..."
                      value={feedbackQ1}
                      onChange={(e) => setFeedbackQ1(e.target.value)}
                      rows={3}
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="feedback-q2" className="text-sm font-medium">
                      2. What does a completed EPB mean to you?
                    </Label>
                    <Textarea
                      id="feedback-q2"
                      placeholder="e.g., All MPAs written, approved by supervisor, submitted in myEval..."
                      value={feedbackQ2}
                      onChange={(e) => setFeedbackQ2(e.target.value)}
                      rows={3}
                      className="resize-none"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowFeedbackDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitFeedback}
                    disabled={isSubmittingFeedback || (!feedbackQ1.trim() && !feedbackQ2.trim())}
                  >
                    {isSubmittingFeedback ? (
                      <>
                        <Loader2 className="size-4 animate-spin mr-2" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="size-4 mr-2" />
                        Submit
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Fixed-height container to prevent layout shift */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 min-h-[200px]">
          {/* MPA List - Left Column */}
          <div className="space-y-1.5">
            {STANDARD_MGAS.map((mpa) => {
              const statements = mpaStatements[mpa.key] || [];
              const hasStatements = statements.length > 0;
              const isSelected = selectedMpaForView === mpa.key;
              const isHLR = mpa.key === "hlr_assessment";

              return (
                <button
                  key={mpa.key}
                  onClick={() => {
                    if (hasStatements) {
                      setExpandedMpas((prev) => {
                        const newState: Record<string, boolean> = {};
                        // Only one can be expanded at a time
                        STANDARD_MGAS.forEach((m) => {
                          newState[m.key] = m.key === mpa.key && !prev[mpa.key];
                        });
                        return newState;
                      });
                    }
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all",
                    isSelected && "ring-2 ring-primary",
                    hasStatements
                      ? "bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer"
                      : "bg-muted/30 cursor-default opacity-60"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {hasStatements ? (
                      <Check className="size-3.5 text-green-600 shrink-0" />
                    ) : (
                      <div className="size-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                    )}
                    {isHLR && <Crown className="size-3.5 text-amber-600 shrink-0" />}
                    <span className="text-xs font-medium truncate">
                      {MPA_ABBREVIATIONS[mpa.key] || mpa.key}
                    </span>
                  </div>
                  <Badge variant={hasStatements ? "default" : "secondary"} className="text-[10px] shrink-0">
                    {statements.length}
                  </Badge>
                </button>
              );
            })}
          </div>

          {/* Statement Detail - Right Column */}
          <div className="rounded-lg border bg-muted/20 p-4 min-h-[200px]">
            {selectedMpaForView && selectedMpaStatements.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{selectedMpaLabel}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setExpandedMpas({})}
                  >
                    Close
                  </Button>
                </div>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {selectedMpaStatements.map((stmt, idx) => (
                    <div key={idx} className="p-3 rounded-lg border bg-card text-sm">
                      <p className="leading-relaxed">{stmt.statement}</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                          {stmt.created_by === profileId
                            ? "Created by you"
                            : selectedUser === "self"
                            ? "Created by your supervisor"
                            : "Created by member"}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={() => {
                            navigator.clipboard.writeText(stmt.statement);
                            setCopiedMpa(`${selectedMpaForView}-${idx}`);
                            toast.success("Copied to clipboard");
                            setTimeout(() => setCopiedMpa(null), 2000);
                          }}
                        >
                          {copiedMpa === `${selectedMpaForView}-${idx}` ? (
                            <Check className="size-3 mr-1" />
                          ) : (
                            <Copy className="size-3 mr-1" />
                          )}
                          Copy
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <FileText className="size-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {Object.values(mpaStatements).some((s) => s.length > 0)
                    ? "Click an MPA to view its statement"
                    : "No statements created yet"}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

