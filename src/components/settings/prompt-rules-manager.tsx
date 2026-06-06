"use client";

import { useCallback, useRef, useState } from "react";
import { usePromptRulesStore } from "@/stores/prompt-rules-store";
import {
  MAX_RULES_PER_CONTEXT,
  MAX_RULE_TEXT_LENGTH,
} from "@/lib/prompt-rules/constants";
import type { PromptRuleContext } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Loader2, Pencil, Plus, Trash2, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptRulesManagerProps {
  context: PromptRuleContext;
  title?: string;
  description?: string;
  compact?: boolean;
}

export function PromptRulesManager({
  context,
  title = "Custom Rules",
  description = "Add rules the AI must follow. Your rules override conflicting default instructions.",
  compact = false,
}: PromptRulesManagerProps) {
  const rules = usePromptRulesStore((s) => s.rulesByContext[context]);
  const isLoading = usePromptRulesStore((s) => s.isLoading[context] ?? false);
  const isSaving = usePromptRulesStore((s) => s.isSaving);
  const fetchRules = usePromptRulesStore((s) => s.fetchRules);
  const createRule = usePromptRulesStore((s) => s.createRule);
  const updateRule = usePromptRulesStore((s) => s.updateRule);
  const deleteRule = usePromptRulesStore((s) => s.deleteRule);

  const [newRuleText, setNewRuleText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const loadedContextsRef = useRef<Set<PromptRuleContext>>(new Set());

  const mountRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || loadedContextsRef.current.has(context)) return;
      loadedContextsRef.current.add(context);
      void fetchRules(context);
    },
    [context, fetchRules],
  );

  const activeCount = (rules ?? []).filter((r) => r.is_active).length;
  const canAddActive = activeCount < MAX_RULES_PER_CONTEXT;

  const handleAdd = async () => {
    const trimmed = newRuleText.trim();
    if (!trimmed) {
      toast.error("Enter a rule before adding.");
      return;
    }
    if (trimmed.length > MAX_RULE_TEXT_LENGTH) {
      toast.error(`Rules must be ${MAX_RULE_TEXT_LENGTH} characters or fewer.`);
      return;
    }
    if (!canAddActive) {
      toast.error(`Maximum ${MAX_RULES_PER_CONTEXT} active rules per context.`);
      return;
    }

    const rule = await createRule(context, trimmed);
    if (rule) {
      setNewRuleText("");
      toast.success("Rule added.");
    } else {
      toast.error("Failed to add rule.");
    }
  };

  const handleSaveEdit = async (id: string) => {
    const trimmed = editText.trim();
    if (!trimmed) {
      toast.error("Rule text cannot be empty.");
      return;
    }
    const updated = await updateRule(id, context, { ruleText: trimmed });
    if (updated) {
      setEditingId(null);
      setEditText("");
      toast.success("Rule updated.");
    } else {
      toast.error("Failed to update rule.");
    }
  };

  const handleToggleActive = async (id: string, nextActive: boolean) => {
    if (nextActive && !canAddActive) {
      toast.error(`Maximum ${MAX_RULES_PER_CONTEXT} active rules per context.`);
      return;
    }
    const updated = await updateRule(id, context, { isActive: nextActive });
    if (!updated) {
      toast.error("Failed to update rule.");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteRule(id, context);
    if (ok) {
      toast.success("Rule deleted.");
    } else {
      toast.error("Failed to delete rule.");
    }
  };

  const listContent = (
    <div className="space-y-3 min-h-[120px]">
      {isLoading && rules === undefined ? (
        <>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </>
      ) : (rules ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
          No rules yet. Add your first rule below.
        </p>
      ) : (
        (rules ?? []).map((rule, index) => (
          <div
            key={rule.id}
            className={cn(
              "rounded-md border p-3 space-y-2",
              !rule.is_active && "opacity-60 bg-muted/30",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0 pt-0.5">
                {index + 1}.
              </span>
              {editingId === rule.id ? (
                <div className="flex-1 space-y-2">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    maxLength={MAX_RULE_TEXT_LENGTH}
                    rows={3}
                    aria-label={`Edit rule ${index + 1}`}
                    className="resize-y min-h-[72px]"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleSaveEdit(rule.id)}
                      disabled={isSaving}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setEditText("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="flex-1 text-sm whitespace-pre-wrap break-words">
                  {rule.rule_text}
                </p>
              )}
            </div>
            {editingId !== rule.id && (
              <div className="flex items-center justify-between gap-2 pl-5">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`rule-active-${rule.id}`}
                    checked={rule.is_active}
                    onCheckedChange={(checked) =>
                      void handleToggleActive(rule.id, checked)
                    }
                    disabled={isSaving}
                    aria-label={`Toggle rule ${index + 1} active`}
                  />
                  <Label
                    htmlFor={`rule-active-${rule.id}`}
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Active
                  </Label>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={`Edit rule ${index + 1}`}
                    onClick={() => {
                      setEditingId(rule.id);
                      setEditText(rule.rule_text);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        aria-label={`Delete rule ${index + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This cannot be undone. The rule will no longer apply to
                          future generations.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => void handleDelete(rule.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  const addForm = (
    <div className="space-y-2 pt-2 border-t">
      <Label htmlFor={`new-rule-${context}`} className="text-sm font-medium">
        Add a rule
      </Label>
      <Textarea
        id={`new-rule-${context}`}
        value={newRuleText}
        onChange={(e) => setNewRuleText(e.target.value)}
        placeholder="e.g. Always use present tense for duty descriptions."
        maxLength={MAX_RULE_TEXT_LENGTH}
        rows={compact ? 2 : 3}
        aria-label="New rule text"
        className="resize-y min-h-[72px]"
      />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground tabular-nums">
          {newRuleText.length}/{MAX_RULE_TEXT_LENGTH} · {activeCount}/
          {MAX_RULES_PER_CONTEXT} active
        </span>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleAdd()}
          disabled={isSaving || !newRuleText.trim() || !canAddActive}
          aria-label="Add rule"
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add rule
        </Button>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div ref={mountRef} className="space-y-4">
        <div className="flex items-start gap-2">
          <ListChecks className="size-4 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {listContent}
        {addForm}
      </div>
    );
  }

  return (
    <div ref={mountRef}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="size-4" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {listContent}
          {addForm}
        </CardContent>
      </Card>
    </div>
  );
}
