"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2,
  Users,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  Calendar,
  Eye,
  History,
  User,
} from "lucide-react";
import type { Profile, SupervisorFeedback } from "@/types/database";
import { getMyReceivedFeedbacks } from "@/app/actions/supervisor-feedbacks";
import { getFeedbackTypeLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatDateDefault, formatMonthYear } from "@/lib/format";

interface SupervisorWithData {
  profile: Profile;
  isCurrent: boolean;
  supervisionStart?: string;
  supervisionEnd?: string | null;
  feedbacks: SupervisorFeedback[];
}

interface SupervisorFeedbackPanelProps {
  trigger?: React.ReactNode;
}

function formatSupervisionDateRange(start?: string, end?: string | null): string {
  if (!start) return "Unknown";
  const startDate = formatMonthYear(start, "short");
  if (!end) return `${startDate} - Present`;
  const endDate = formatMonthYear(end, "short");
  return `${startDate} - ${endDate}`;
}

export function SupervisorFeedbackPanel({ trigger }: SupervisorFeedbackPanelProps) {
  const { profile } = useUserStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [supervisors, setSupervisors] = useState<SupervisorWithData[]>([]);
  const [expandedSupervisors, setExpandedSupervisors] = useState<Set<string>>(
    new Set()
  );
  const loadRequestIdRef = useRef(0);

  const supabase = createClient();

  async function loadData() {
    if (!profile) return;

    const requestId = ++loadRequestIdRef.current;
    setIsLoading(true);

    try {
      type TeamWithSupervisor = {
        supervisor_id: string;
        supervision_start_date: string | null;
        supervision_end_date: string | null;
        supervisor: Profile | null;
      };

      type HistoryWithSupervisor = {
        supervisor_id: string;
        started_at: string;
        ended_at: string | null;
        supervisor: Profile | null;
      };

      const [currentTeamsResult, historyTeamsResult, feedbacksResult] =
        await Promise.all([
          supabase
            .from("teams")
            .select(
              `
            supervisor_id,
            supervision_start_date,
            supervision_end_date,
            supervisor:profiles!teams_supervisor_id_fkey(
              id, full_name, rank, email
            )
          `
            )
            .eq("subordinate_id", profile.id) as unknown as Promise<{
            data: TeamWithSupervisor[] | null;
          }>,
          supabase
            .from("team_history")
            .select(
              `
            supervisor_id,
            started_at,
            ended_at,
            supervisor:profiles!team_history_supervisor_id_fkey(
              id, full_name, rank, email
            )
          `
            )
            .eq("subordinate_id", profile.id)
            .not("ended_at", "is", null)
            .order("ended_at", { ascending: false }) as unknown as Promise<{
            data: HistoryWithSupervisor[] | null;
          }>,
          getMyReceivedFeedbacks(),
        ]);

      if (requestId !== loadRequestIdRef.current) return;

      const currentTeams = currentTeamsResult.data;
      const historyTeams = historyTeamsResult.data;

      const supervisorMap = new Map<string, SupervisorWithData>();

      if (currentTeams) {
        for (const team of currentTeams) {
          const sup = team.supervisor;
          if (sup?.id) {
            supervisorMap.set(sup.id, {
              profile: sup,
              isCurrent: true,
              supervisionStart: team.supervision_start_date || undefined,
              supervisionEnd: team.supervision_end_date,
              feedbacks: [],
            });
          }
        }
      }

      if (historyTeams) {
        for (const history of historyTeams) {
          const sup = history.supervisor;
          if (sup?.id && !supervisorMap.has(sup.id)) {
            supervisorMap.set(sup.id, {
              profile: sup,
              isCurrent: false,
              supervisionStart: history.started_at,
              supervisionEnd: history.ended_at,
              feedbacks: [],
            });
          }
        }
      }

      if (feedbacksResult.data) {
        for (const fb of feedbacksResult.data) {
          const supData = supervisorMap.get(fb.supervisor_id);
          if (supData) {
            supData.feedbacks.push(fb);
          }
        }
      }

      const sortedSupervisors = Array.from(supervisorMap.values()).sort(
        (a, b) => {
          if (a.isCurrent && !b.isCurrent) return -1;
          if (!a.isCurrent && b.isCurrent) return 1;
          const aEnd = a.supervisionEnd
            ? new Date(a.supervisionEnd).getTime()
            : 0;
          const bEnd = b.supervisionEnd
            ? new Date(b.supervisionEnd).getTime()
            : 0;
          return bEnd - aEnd;
        }
      );

      const currentIds = new Set<string>();
      for (const s of sortedSupervisors) {
        if (s.isCurrent) currentIds.add(s.profile.id);
      }
      setSupervisors(sortedSupervisors);
      setExpandedSupervisors(currentIds);
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error("Error loading supervisor data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setIsOpen(next);
    if (next) {
      void loadData();
    } else {
      loadRequestIdRef.current += 1;
    }
  }

  function toggleSupervisor(id: string) {
    setExpandedSupervisors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const currentSupervisors = supervisors.filter((s) => s.isCurrent);
  const historicalSupervisors = supervisors.filter((s) => !s.isCurrent);

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Users className="size-4" />
            <span className="hidden sm:inline">Supervisors</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Supervisor Feedback
          </SheetTitle>
          <SheetDescription>
            View session guides your supervisors have shared with you
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : supervisors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="size-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No supervisors found</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Connect with a supervisor in the Team page to see their feedback
                here
              </p>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              {currentSupervisors.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-primary" />
                    <h3 className="text-sm font-medium">
                      Current Supervisor
                      {currentSupervisors.length > 1 ? "s" : ""}
                    </h3>
                  </div>

                  {currentSupervisors.map((sup) => (
                    <SupervisorCard
                      key={sup.profile.id}
                      supervisor={sup}
                      isExpanded={expandedSupervisors.has(sup.profile.id)}
                      onToggle={() => toggleSupervisor(sup.profile.id)}
                      formatDateRange={formatSupervisionDateRange}
                    />
                  ))}
                </div>
              )}

              {historicalSupervisors.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <History className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Past Supervisors
                    </h3>
                  </div>

                  {historicalSupervisors.map((sup) => (
                    <SupervisorCard
                      key={sup.profile.id}
                      supervisor={sup}
                      isExpanded={expandedSupervisors.has(sup.profile.id)}
                      onToggle={() => toggleSupervisor(sup.profile.id)}
                      formatDateRange={formatSupervisionDateRange}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function SupervisorCard({
  supervisor,
  isExpanded,
  onToggle,
  formatDateRange,
}: {
  supervisor: SupervisorWithData;
  isExpanded: boolean;
  onToggle: () => void;
  formatDateRange: (start?: string, end?: string | null) => string;
}) {
  const hasContent = supervisor.feedbacks.length > 0;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card
        className={cn(
          "transition-colors",
          supervisor.isCurrent && "border-primary/30"
        )}
      >
        <CollapsibleTrigger asChild>
          <CardHeader className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarFallback className="text-sm font-medium">
                  {supervisor.profile.full_name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2) || "??"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium truncate">
                    {supervisor.profile.rank && (
                      <span className="text-muted-foreground">
                        {supervisor.profile.rank}{" "}
                      </span>
                    )}
                    {supervisor.profile.full_name || "Unknown"}
                  </CardTitle>
                  {supervisor.isCurrent && (
                    <Badge
                      variant="default"
                      className="text-xs h-5 bg-primary/20 text-primary hover:bg-primary/20"
                    >
                      Current
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs flex items-center gap-1">
                  <Calendar className="size-3" />
                  {formatSupervisionDateRange(
                    supervisor.supervisionStart,
                    supervisor.supervisionEnd
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {hasContent && (
                  <Badge variant="outline" className="text-xs h-5 gap-1">
                    <ClipboardCheck className="size-3" />
                    {supervisor.feedbacks.length}
                  </Badge>
                )}
                {isExpanded ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="p-4 pt-0 space-y-4">
            {!hasContent ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No feedback session guides shared yet
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="size-4 text-green-600" />
                  <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Shared session guides
                  </h4>
                </div>
                {supervisor.feedbacks.map((fb) => (
                  <div
                    key={fb.id}
                    className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
                        {getFeedbackTypeLabel(fb.feedback_type)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Cycle {fb.cycle_year}
                      </Badge>
                      {fb.shared_at && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="size-3" />
                          Shared {formatDateDefault(fb.shared_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{fb.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
