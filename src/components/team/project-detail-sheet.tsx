"use client";

import { useState, useEffect } from "react";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Project, Accomplishment, Rank } from "@/types/database";
import {
  FolderKanban,
  Users,
  Crown,
  Target,
  TrendingUp,
  UserCircle,
  ChevronDown,
  ChevronRight,
  Pencil,
  UserPlus,
  FileText,
  Loader2,
  Calendar,
} from "lucide-react";
import { ENTRY_MGAS } from "@/lib/constants";

interface ProjectDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onEditProject: () => void;
  onManageMembers: () => void;
}

interface ProjectAccomplishment extends Accomplishment {
  owner_profile?: {
    id: string;
    full_name: string | null;
    rank: string | null;
  };
  team_member?: {
    id: string;
    full_name: string;
    rank: string | null;
  };
}

export function ProjectDetailSheet({
  open,
  onOpenChange,
  project,
  onEditProject,
  onManageMembers,
}: ProjectDetailSheetProps) {
  const { profile } = useUserStore();
  const [accomplishments, setAccomplishments] = useState<ProjectAccomplishment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());

  // Load accomplishments when project changes
  useEffect(() => {
    async function loadAccomplishments() {
      if (!project || !open) return;

      setIsLoading(true);
      try {
        const response = await fetch(`/api/projects/${project.id}`);
        if (response.ok) {
          const { accomplishments } = await response.json();
          setAccomplishments(accomplishments || []);
        }
      } catch (error) {
        console.error("Error loading accomplishments:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadAccomplishments();
  }, [project, open]);

  if (!project) return null;

  const members = project.members || [];
  const isOwner = members.some(
    (m) => m.profile_id === profile?.id && m.is_owner
  );

  // Group accomplishments by member
  const accomplishmentsByMember: Record<
    string,
    { name: string; rank: string | null; accomplishments: ProjectAccomplishment[] }
  > = {};

  accomplishments.forEach((acc) => {
    let memberId: string;
    let memberName: string;
    let memberRank: string | null = null;

    if (acc.team_member) {
      memberId = `tm:${acc.team_member.id}`;
      memberName = acc.team_member.full_name;
      memberRank = acc.team_member.rank;
    } else if (acc.owner_profile) {
      memberId = `p:${acc.owner_profile.id}`;
      memberName = acc.owner_profile.full_name || "Unknown";
      memberRank = acc.owner_profile.rank;
    } else {
      memberId = `p:${acc.user_id}`;
      memberName = "Unknown";
    }

    if (!accomplishmentsByMember[memberId]) {
      accomplishmentsByMember[memberId] = {
        name: memberName,
        rank: memberRank,
        accomplishments: [],
      };
    }
    accomplishmentsByMember[memberId].accomplishments.push(acc);
  });

  const toggleMember = (memberId: string) => {
    const newExpanded = new Set(expandedMembers);
    if (newExpanded.has(memberId)) {
      newExpanded.delete(memberId);
    } else {
      newExpanded.add(memberId);
    }
    setExpandedMembers(newExpanded);
  };

  const getMpaLabel = (mpa: string) => {
    return ENTRY_MGAS.find((m) => m.key === mpa)?.label || mpa;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[600px] sm:max-w-[600px] p-0 flex flex-col"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <FolderKanban className="size-5 text-primary shrink-0" />
                <SheetTitle className="truncate">{project.name}</SheetTitle>
                {isOwner && <Crown className="size-4 text-amber-500 shrink-0" />}
              </div>
              {project.description && (
                <SheetDescription className="line-clamp-2">
                  {project.description}
                </SheetDescription>
              )}
            </div>
            <div className="flex gap-2 shrink-0 mr-8">
              <Button variant="outline" size="sm" onClick={onManageMembers}>
                <UserPlus className="size-4 mr-1" />
                Members
              </Button>
              {isOwner && (
                <Button variant="outline" size="sm" onClick={onEditProject}>
                  <Pencil className="size-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="details" className="flex-1 flex flex-col">
          <TabsList className="mx-6 mt-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="members">
              Members ({members.length})
            </TabsTrigger>
            <TabsTrigger value="accomplishments">
              Entries ({accomplishments.length})
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 px-6 py-4">
            <TabsContent value="details" className="mt-0 space-y-4">
              {/* Scope */}
              {project.scope && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Scope</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {project.scope}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Result */}
              {project.result && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Target className="size-4 text-primary" />
                      <CardTitle className="text-sm font-medium">Result</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{project.result}</p>
                  </CardContent>
                </Card>
              )}

              {/* Impact */}
              {project.impact && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="size-4 text-green-600" />
                      <CardTitle className="text-sm font-medium">Impact</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{project.impact}</p>
                  </CardContent>
                </Card>
              )}

              {/* Metrics */}
              {project.metrics?.people_impacted && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-muted-foreground" />
                      <span className="text-sm">
                        {project.metrics.people_impacted.toLocaleString()} people
                        impacted
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Stakeholders */}
              {project.key_stakeholders && project.key_stakeholders.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Key Stakeholders
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {project.key_stakeholders.map((stakeholder, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-2 text-sm"
                        >
                          <UserCircle className="size-4 text-muted-foreground mt-0.5" />
                          <div>
                            <span className="font-medium">{stakeholder.name}</span>
                            {stakeholder.title && (
                              <span className="text-muted-foreground">
                                {" "}
                                - {stakeholder.title}
                              </span>
                            )}
                            {stakeholder.role && (
                              <p className="text-xs text-muted-foreground">
                                {stakeholder.role}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* No details placeholder */}
              {!project.scope &&
                !project.result &&
                !project.impact &&
                !project.metrics?.people_impacted &&
                (!project.key_stakeholders ||
                  project.key_stakeholders.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="size-8 mx-auto mb-2" />
                    <p className="text-sm">No project details added yet</p>
                    {isOwner && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={onEditProject}
                      >
                        Add Details
                      </Button>
                    )}
                  </div>
                )}
            </TabsContent>

            <TabsContent value="members" className="mt-0 space-y-2">
              {members.map((member) => {
                const name = member.profile
                  ? `${member.profile.rank || ""} ${member.profile.full_name}`.trim()
                  : member.team_member
                  ? `${member.team_member.rank || ""} ${member.team_member.full_name}`.trim()
                  : "Unknown";

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{name}</span>
                      {member.is_owner && (
                        <Crown className="size-3.5 text-amber-500" />
                      )}
                      {member.team_member_id && (
                        <Badge variant="secondary" className="text-[10px]">
                          Managed
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {member.profile?.afsc || member.team_member?.afsc}
                    </span>
                  </div>
                );
              })}
            </TabsContent>

            <TabsContent value="accomplishments" className="mt-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : Object.keys(accomplishmentsByMember).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="size-8 mx-auto mb-2" />
                  <p className="text-sm">No accomplishments linked yet</p>
                  <p className="text-xs mt-1">
                    Members can link entries to this project in the Entries page
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(accomplishmentsByMember).map(
                    ([memberId, { name, rank, accomplishments }]) => (
                      <Collapsible
                        key={memberId}
                        open={expandedMembers.has(memberId)}
                        onOpenChange={() => toggleMember(memberId)}
                      >
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-2">
                              {expandedMembers.has(memberId) ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                              <span className="font-medium text-sm">
                                {rank} {name}
                              </span>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {accomplishments.length} entries
                            </Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-6 mt-2 space-y-2">
                            {accomplishments.map((acc) => (
                              <div
                                key={acc.id}
                                className="p-3 rounded-lg border bg-muted/30"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    {getMpaLabel(acc.mpa)}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Calendar className="size-3" />
                                    {new Date(acc.date).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="text-sm font-medium">
                                  {acc.action_verb}
                                </p>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                  {acc.details}
                                </p>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  )}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
