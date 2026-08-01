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

      // Filter out empty stakeholders
      const validStakeholders = stakeholders.filter(
        (s) => s.name.trim() || s.title.trim()
      );

      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          scope: form.scope.trim() || null,
          result: form.result.trim() || null,
          impact: form.impact.trim() || null,
          key_stakeholders: validStakeholders,
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

  // Fixed height for content area to prevent shifting
  const contentHeight = "h-[320px]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
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
            <TabsList className="grid grid-cols-3 mx-6 w-[calc(100%-3rem)]">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="results">Results & Impact</TabsTrigger>
              <TabsTrigger value="stakeholders">Stakeholders</TabsTrigger>
            </TabsList>

            <div className={`${contentHeight} overflow-y-auto px-6 py-4`}>
              <TabsContent value="basic" className="mt-0 space-y-4">
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
                    rows={3}
                  />
                </div>
              </TabsContent>

              <TabsContent value="results" className="mt-0 space-y-4">
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

              <TabsContent value="stakeholders" className="mt-0 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Key Stakeholders</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Organizations, units, or individuals impacted by or invested in the project
                      </p>
                    </div>
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
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">No stakeholders added yet</p>
                      <p className="text-xs mt-1">
                        Examples: HAF, ACC, 55 WG, DoD, local community, specific leaders
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stakeholders.map((stakeholder, index) => (
                        <div
                          key={`stakeholder-${stakeholder.name || "new"}-${stakeholder.title || ""}`}
                          className="p-3 rounded-lg border bg-muted/30 space-y-2"
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 space-y-2">
                              <Input
                                placeholder="Name (e.g., HAF, 55 WG/CC, ACC A3)"
                                value={stakeholder.name}
                                onChange={(e) =>
                                  updateStakeholder(index, "name", e.target.value)
                                }
                                disabled={isSubmitting}
                                className="text-sm"
                              />
                              <Input
                                placeholder="Title/Description (e.g., Headquarters Air Force, Wing Commander)"
                                value={stakeholder.title}
                                onChange={(e) =>
                                  updateStakeholder(index, "title", e.target.value)
                                }
                                disabled={isSubmitting}
                                className="text-sm"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 mt-1"
                              onClick={() => removeStakeholder(index)}
                              disabled={isSubmitting}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="px-6 py-4 border-t flex-row justify-between sm:justify-between">
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
                    Are you sure you want to delete &quot;{project.name}&quot;? This will
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
