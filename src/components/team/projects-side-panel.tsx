"use client";

import { useState, useEffect, useMemo } from "react";
import { useProjectsStore } from "@/stores/projects-store";
import { useUserStore } from "@/stores/user-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getActiveCycleYear } from "@/lib/constants";
import type { Project, Rank } from "@/types/database";
import {
  FolderKanban,
  Plus,
  Users,
  Crown,
  ChevronRight,
  Loader2,
  Pencil,
  MoreHorizontal,
  Target,
  TrendingUp,
  X,
  UserPlus,
  Check,
  HelpCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProjectsSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProject: () => void;
  onEditProject: (project: Project) => void;
  onViewProject: (project: Project) => void;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  isAssignMode: boolean;
  onToggleAssignMode: () => void;
  onShowHelp?: () => void;
  className?: string;
}

export function ProjectsSidePanel({
  isOpen,
  onClose,
  onAddProject,
  onEditProject,
  onViewProject,
  selectedProjectId,
  onSelectProject,
  isAssignMode,
  onToggleAssignMode,
  onShowHelp,
  className,
}: ProjectsSidePanelProps) {
  const { profile } = useUserStore();
  const {
    projects,
    setProjects,
    isLoading,
    setIsLoading,
  } = useProjectsStore();

  const [selectedYear, setSelectedYear] = useState<string>("all");
  const cycleYear = getActiveCycleYear(profile?.rank as Rank | null);

  // Load projects
  useEffect(() => {
    async function loadProjects() {
      if (!profile) return;

      setIsLoading(true);
      try {
        const response = await fetch("/api/projects");
        if (response.ok) {
          const { projects } = await response.json();
          setProjects(projects || []);
        }
      } catch (error) {
        console.error("Error loading projects:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (isOpen) {
      loadProjects();
    }
  }, [profile, isOpen, setProjects, setIsLoading]);

  // Get unique years from projects
  const years = useMemo(() => {
    const yearSet = new Set<number>();
    projects.forEach((p) => yearSet.add(p.cycle_year));
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [projects]);

  // Filter projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (selectedYear !== "all" && p.cycle_year !== parseInt(selectedYear)) {
        return false;
      }
      return true;
    });
  }, [projects, selectedYear]);

  // Check if user is owner of a project
  const isOwner = (project: Project) => {
    return project.members?.some(
      (m) => m.profile_id === profile?.id && m.is_owner
    );
  };

  // Get member count
  const getMemberCount = (project: Project) => {
    return project.members?.length || 0;
  };

  // Get selected project
  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "w-full md:w-[380px] lg:w-[420px] shrink-0 border-l bg-background flex flex-col h-full overflow-hidden transition-all duration-300",
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FolderKanban className="size-4 text-primary" />
            <h2 className="font-semibold text-sm">Projects</h2>
            {onShowHelp && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={onShowHelp}
                    >
                      <HelpCircle className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Learn about Projects</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onAddProject}>
              <Plus className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onClose}>
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[110px] h-7 text-xs">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-[10px] h-5">
            {filteredProjects.length}
          </Badge>
        </div>
      </div>

      {/* Assign Mode Banner */}
      {isAssignMode && selectedProject && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="size-4 text-amber-600" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Assign Mode: Click members in tree
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs border-amber-500/50"
              onClick={onToggleAssignMode}
            >
              <Check className="size-3 mr-1" />
              Done
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Adding to: <span className="font-medium">{selectedProject.name}</span>
          </p>
        </div>
      )}

      {/* Project List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8">
              <FolderKanban className="size-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium text-sm mb-1">No projects yet</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Create a project to share context
              </p>
              <Button size="sm" onClick={onAddProject}>
                <Plus className="size-3.5 mr-1.5" />
                Create Project
              </Button>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <Card
                key={project.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-sm",
                  selectedProjectId === project.id &&
                    "ring-2 ring-primary border-primary bg-primary/5"
                )}
                onClick={() =>
                  onSelectProject(
                    selectedProjectId === project.id ? null : project.id
                  )
                }
              >
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <CardTitle className="text-sm truncate">
                          {project.name}
                        </CardTitle>
                        {isOwner(project) && (
                          <Crown className="size-3 text-amber-500 shrink-0" />
                        )}
                      </div>
                      {project.description && (
                        <CardDescription className="line-clamp-1 text-[10px]">
                          {project.description}
                        </CardDescription>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewProject(project);
                          }}
                        >
                          <ChevronRight className="size-3.5 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectProject(project.id);
                            // Enable assign mode after selecting
                            if (!isAssignMode) {
                              onToggleAssignMode();
                            }
                          }}
                        >
                          <UserPlus className="size-3.5 mr-2" />
                          Assign Members
                        </DropdownMenuItem>
                        {isOwner(project) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditProject(project);
                              }}
                            >
                              <Pencil className="size-3.5 mr-2" />
                              Edit Project
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Users className="size-3" />
                      <span>{getMemberCount(project)}</span>
                    </div>
                    {project.result && (
                      <Tooltip>
                        <TooltipTrigger>
                          <div className="flex items-center gap-0.5 text-[10px] text-green-600">
                            <Target className="size-3" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px]">
                          <p className="text-xs font-medium">Result</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {project.result}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {project.impact && (
                      <Tooltip>
                        <TooltipTrigger>
                          <div className="flex items-center gap-0.5 text-[10px] text-blue-600">
                            <TrendingUp className="size-3" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px]">
                          <p className="text-xs font-medium">Impact</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {project.impact}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Badge variant="outline" className="text-[9px] h-4 ml-auto">
                      {project.cycle_year}
                    </Badge>
                  </div>

                  {/* Show members when selected */}
                  {selectedProjectId === project.id && project.members && project.members.length > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1.5">
                        Team Members
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {project.members.slice(0, 5).map((member) => {
                          const name = member.profile?.full_name || member.team_member?.full_name || "Unknown";
                          const rank = member.profile?.rank || member.team_member?.rank || "";
                          return (
                            <Badge
                              key={member.id}
                              variant={member.is_owner ? "default" : "secondary"}
                              className="text-[9px] h-5 gap-0.5"
                            >
                              {member.is_owner && <Crown className="size-2.5" />}
                              {rank} {name.split(" ")[0]}
                            </Badge>
                          );
                        })}
                        {project.members.length > 5 && (
                          <Badge variant="outline" className="text-[9px] h-5">
                            +{project.members.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
