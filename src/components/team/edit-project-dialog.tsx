"use client";

import { useState, useEffect } from "react";
import { useProjectsStore } from "@/stores/projects-store";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { Loader2, FolderKanban, Trash2, Plus, X } from "lucide-react";
import type { Project, ProjectStakeholder, ProjectMetrics } from "@/types/database";

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onSuccess?: () => void;
}

export function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSuccess,
}: EditProjectDialogProps) {
  const { updateProject, removeProject } = useProjectsStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    scope: "",
    result: "",
    impact: "",
    people_impacted: "",
  });

  const [stakeholders, setStakeholders] = useState<ProjectStakeholder[]>([]);

  // Initialize form when project changes
  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || "",
        description: project.description || "",
        scope: project.scope || "",
        result: project.result || "",
        impact: project.impact || "",
        people_impacted: project.metrics?.people_impacted?.toString() || "",
      });
      setStakeholders(project.key_stakeholders || []);
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!project) return;
    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const metrics: ProjectMetrics = {};
      if (form.people_impacted) {
        metrics.people_impacted = parseInt(form.people_impacted);
      }

      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          scope: form.scope.trim() || null,
          result: form.result.trim() || null,
          impact: form.impact.trim() || null,
          key_stakeholders: stakeholders,
          metrics: Object.keys(metrics).length > 0 ? metrics : null,
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || "Failed to update project");
      }

      const { project: updatedProject } = await response.json();
      updateProject(project.id, updatedProject);
      toast.success("Project updated successfully");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error updating project:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update project"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || "Failed to delete project");
      }

      removeProject(project.id);
      toast.success("Project deleted");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete project"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const addStakeholder = () => {
    setStakeholders([...stakeholders, { name: "", title: "", role: "" }]);
  };

  const updateStakeholder = (
    index: number,
    field: keyof ProjectStakeholder,
    value: string
  ) => {
    const updated = [...stakeholders];
    updated[index] = { ...updated[index], [field]: value };
    setStakeholders(updated);
  };

  const removeStakeholder = (index: number) => {
    setStakeholders(stakeholders.filter((_, i) => i !== index));
  };

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FolderKanban className="size-5 text-primary" />
            <DialogTitle>Edit Project</DialogTitle>
          </div>
          <DialogDescription>
            Update project details and metadata. Only project owners can edit.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="results">Results & Impact</TabsTrigger>
              <TabsTrigger value="stakeholders">Stakeholders</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">
                  Project Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-scope">Scope</Label>
                <Textarea
                  id="edit-scope"
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  disabled={isSubmitting}
                  rows={2}
                />
              </div>
            </TabsContent>

            <TabsContent value="results" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="edit-result">Result</Label>
                <Textarea
                  id="edit-result"
                  placeholder="What was achieved? (e.g., 100% compliance rate, zero defects)"
                  value={form.result}
                  onChange={(e) => setForm({ ...form, result: e.target.value })}
                  disabled={isSubmitting}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  This will be included as context when generating EPB statements
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-impact">Impact</Label>
                <Textarea
                  id="edit-impact"
                  placeholder="What was the broader impact? (e.g., saved $50K, improved mission readiness by 20%)"
                  value={form.impact}
                  onChange={(e) => setForm({ ...form, impact: e.target.value })}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-people">People Impacted</Label>
                <Input
                  id="edit-people"
                  type="number"
                  placeholder="e.g., 500"
                  value={form.people_impacted}
                  onChange={(e) =>
                    setForm({ ...form, people_impacted: e.target.value })
                  }
                  disabled={isSubmitting}
                />
              </div>
            </TabsContent>

            <TabsContent value="stakeholders" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Key Stakeholders</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addStakeholder}
                  >
                    <Plus className="size-4 mr-1" />
                    Add
                  </Button>
                </div>

                {stakeholders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No stakeholders added yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stakeholders.map((stakeholder, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start"
                      >
                        <Input
                          placeholder="Name"
                          value={stakeholder.name}
                          onChange={(e) =>
                            updateStakeholder(index, "name", e.target.value)
                          }
                          disabled={isSubmitting}
                        />
                        <Input
                          placeholder="Title"
                          value={stakeholder.title}
                          onChange={(e) =>
                            updateStakeholder(index, "title", e.target.value)
                          }
                          disabled={isSubmitting}
                        />
                        <Input
                          placeholder="Role in project"
                          value={stakeholder.role}
                          onChange={(e) =>
                            updateStakeholder(index, "role", e.target.value)
                          }
                          disabled={isSubmitting}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeStakeholder(index)}
                          disabled={isSubmitting}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Add key stakeholders who benefited from or contributed to the
                  project
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6 flex-row justify-between sm:justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSubmitting || isDeleting}
                >
                  {isDeleting && <Loader2 className="size-4 mr-2 animate-spin" />}
                  <Trash2 className="size-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Project</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{project.name}"? This will
                    remove all project data and unlink all accomplishments. This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete Project
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex gap-2">
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
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
