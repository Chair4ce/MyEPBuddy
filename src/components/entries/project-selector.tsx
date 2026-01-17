"use client";

import { useState, useEffect } from "react";
import { useUserStore } from "@/stores/user-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FolderKanban } from "lucide-react";
import type { Project, Rank } from "@/types/database";
import { getActiveCycleYear } from "@/lib/constants";

interface ProjectSelectorProps {
  value: string | null;
  onChange: (projectId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export function ProjectSelector({
  value,
  onChange,
  disabled = false,
  className,
}: ProjectSelectorProps) {
  const { profile } = useUserStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const cycleYear = getActiveCycleYear(profile?.rank as Rank | null);

  useEffect(() => {
    async function loadProjects() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/projects?cycle_year=${cycleYear}`);
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

    loadProjects();
  }, [cycleYear]);

  if (projects.length === 0 && !isLoading) {
    return null;
  }

  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => onChange(v === "none" ? null : v)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={className}>
        <div className="flex items-center gap-2">
          <FolderKanban className="size-4 text-muted-foreground" />
          <SelectValue placeholder="Link to project (optional)" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground">No project</span>
        </SelectItem>
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <div className="flex items-center gap-2">
              <span>{project.name}</span>
              <Badge variant="outline" className="text-[10px]">
                {project.members?.length || 0}
              </Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
