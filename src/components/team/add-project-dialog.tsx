"use client";

import { useState } from "react";
import { useProjectsStore } from "@/stores/projects-store";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { Loader2, FolderKanban } from "lucide-react";
import { getActiveCycleYear } from "@/lib/constants";
import type { Rank } from "@/types/database";

interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddProjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddProjectDialogProps) {
  const { profile } = useUserStore();
  const { addProject } = useProjectsStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cycleYear = getActiveCycleYear(profile?.rank as Rank | null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    scope: "",
  });

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      scope: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          scope: form.scope.trim() || null,
          cycle_year: cycleYear,
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || "Failed to create project");
      }

      const { project } = await response.json();
      addProject(project);
      toast.success("Project created successfully");
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error creating project:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create project"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FolderKanban className="size-5 text-primary" />
            <DialogTitle>Create Project</DialogTitle>
          </div>
          <DialogDescription>
            Create a new project to organize team accomplishments and share
            context for EPB statements.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Project Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g., Wing Safety Inspection 2025"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of the project and its objectives..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scope">Scope</Label>
            <Textarea
              id="scope"
              placeholder="What does this project encompass? (e.g., base-wide, squadron-level, affects X personnel)"
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value })}
              disabled={isSubmitting}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !form.name.trim()}>
              {isSubmitting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
