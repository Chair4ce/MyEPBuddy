"use client";

import { useState, useEffect } from "react";
import { useUserStore } from "@/stores/user-store";
import { useAccomplishmentsStore } from "@/stores/accomplishments-store";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import {
  createAccomplishment,
  updateAccomplishment,
} from "@/app/actions/accomplishments";
import { DEFAULT_ACTION_VERBS, ENTRY_MGAS } from "@/lib/constants";
import { Loader2 } from "lucide-react";
import type { Accomplishment } from "@/types/database";

interface EntryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editEntry?: Accomplishment | null;
  targetUserId?: string | null;
  targetManagedMemberId?: string | null;
}

export function EntryFormDialog({
  open,
  onOpenChange,
  editEntry,
  targetUserId,
  targetManagedMemberId,
}: EntryFormDialogProps) {
  const { profile, epbConfig } = useUserStore();
  const { addAccomplishment, updateAccomplishment: updateStore } =
    useAccomplishmentsStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    action_verb: "",
    details: "",
    impact: "",
    metrics: "",
    mpa: "",
    tags: "",
  });

  // Use entry MPAs (excludes HLR which is Commander's assessment)
  const mgas = ENTRY_MGAS;
  const cycleYear = epbConfig?.current_cycle_year || new Date().getFullYear();

  // Reset form when dialog opens/closes or edit entry changes
  useEffect(() => {
    if (editEntry) {
      setForm({
        date: editEntry.date,
        action_verb: editEntry.action_verb,
        details: editEntry.details,
        impact: editEntry.impact,
        metrics: editEntry.metrics || "",
        mpa: editEntry.mpa,
        tags: Array.isArray(editEntry.tags) ? editEntry.tags.join(", ") : "",
      });
    } else {
      setForm({
        date: new Date().toISOString().split("T")[0],
        action_verb: "",
        details: "",
        impact: "",
        metrics: "",
        mpa: mgas[0]?.key || "",
        tags: "",
      });
    }
  }, [editEntry, open, mgas]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.action_verb || !form.details || !form.impact || !form.mpa) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);

    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // For managed members, use supervisor's ID as user_id for RLS
    const userId = targetManagedMemberId ? profile?.id : (targetUserId || profile?.id);
    if (!userId) {
      toast.error("User not found");
      setIsSubmitting(false);
      return;
    }

    try {
      if (editEntry) {
        const result = await updateAccomplishment(editEntry.id, {
          date: form.date,
          action_verb: form.action_verb,
          details: form.details,
          impact: form.impact,
          metrics: form.metrics || null,
          mpa: form.mpa,
          tags,
        });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        if (result.data) {
          updateStore(editEntry.id, result.data);
          toast.success("Entry updated");
        }
      } else {
        const result = await createAccomplishment({
          user_id: targetManagedMemberId ? profile?.id || "" : userId, // For managed members, store supervisor's ID
          created_by: profile?.id || userId,
          team_member_id: targetManagedMemberId || null, // Link to managed member
          date: form.date,
          action_verb: form.action_verb,
          details: form.details,
          impact: form.impact,
          metrics: form.metrics || null,
          mpa: form.mpa,
          tags,
          cycle_year: cycleYear,
        });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        if (result.data) {
          addAccomplishment(result.data);
          toast.success("Entry created");
        }
      }

      onOpenChange(false);
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl max-h-[85dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-6">
          <DialogTitle className="text-base sm:text-lg">
            {editEntry ? "Edit Entry" : "New Accomplishment Entry"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Record your accomplishment with action, details, and impact.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="date" className="text-sm">Date *</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
                aria-label="Accomplishment date"
                className="h-9 sm:h-10"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="mpa" className="text-sm">Major Performance Area *</Label>
              <Select
                value={form.mpa}
                onValueChange={(value) => setForm({ ...form, mpa: value })}
              >
                <SelectTrigger id="mpa" aria-label="Select MPA" className="h-9 sm:h-10">
                  <SelectValue placeholder="Select MPA" />
                </SelectTrigger>
                <SelectContent>
                  {mgas.map((mpa) => (
                    <SelectItem key={mpa.key} value={mpa.key}>
                      {mpa.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="action_verb" className="text-sm">Action Verb *</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select
                value={form.action_verb}
                onValueChange={(value) =>
                  setForm({ ...form, action_verb: value })
                }
              >
                <SelectTrigger className="w-full sm:w-[180px] h-9 sm:h-10 shrink-0" aria-label="Select action verb">
                  <SelectValue placeholder="Select or type" />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_ACTION_VERBS.map((verb) => (
                    <SelectItem key={verb} value={verb}>
                      {verb}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="action_verb"
                placeholder="Or type custom verb"
                value={form.action_verb}
                onChange={(e) =>
                  setForm({ ...form, action_verb: e.target.value })
                }
                className="flex-1 h-9 sm:h-10"
                aria-label="Custom action verb"
              />
            </div>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="details" className="text-sm">
              Details *
              <span className="text-muted-foreground font-normal ml-1 sm:ml-2 text-xs sm:text-sm">
                What did you do?
              </span>
            </Label>
            <Textarea
              id="details"
              placeholder="Describe what you accomplished in detail..."
              value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              required
              className="min-h-[60px] sm:min-h-[80px] resize-y text-sm"
              aria-label="Accomplishment details"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="impact" className="text-sm">
              Impact/Result *
              <span className="text-muted-foreground font-normal ml-1 sm:ml-2 text-xs sm:text-sm">
                What was the outcome?
              </span>
            </Label>
            <Textarea
              id="impact"
              placeholder="Describe the impact, results, or benefits..."
              value={form.impact}
              onChange={(e) => setForm({ ...form, impact: e.target.value })}
              required
              className="min-h-[60px] sm:min-h-[80px] resize-y text-sm"
              aria-label="Impact or result"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="metrics" className="text-sm">
              Metrics
              <span className="text-muted-foreground font-normal ml-1 sm:ml-2 text-xs sm:text-sm">
                (optional)
              </span>
            </Label>
            <Input
              id="metrics"
              placeholder="e.g., 15% increase, 200 hours saved"
              value={form.metrics}
              onChange={(e) => setForm({ ...form, metrics: e.target.value })}
              aria-label="Quantifiable metrics"
              className="h-9 sm:h-10 text-sm"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="tags" className="text-sm">
              Tags
              <span className="text-muted-foreground font-normal ml-1 sm:ml-2 text-xs sm:text-sm">
                (comma separated)
              </span>
            </Label>
            <Input
              id="tags"
              placeholder="e.g., leadership, training"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              aria-label="Tags"
              className="h-9 sm:h-10 text-sm"
            />
          </div>

          <DialogFooter className="pt-2 sm:pt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto h-9 sm:h-10 text-sm"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto h-9 sm:h-10 text-sm">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : editEntry ? (
                "Update Entry"
              ) : (
                "Create Entry"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

