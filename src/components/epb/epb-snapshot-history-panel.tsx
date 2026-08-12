"use client";

import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  groupSnapshotsForHistory,
  type SnapshotHistoryGroup,
  type SnapshotHistoryItem,
} from "@/lib/epb-generated-set-history";
import {
  motionChevronOpen,
  motionCollapseGrid,
  motionEnter,
  motionEnterDurNormal,
  motionListRow,
  motionPressable,
  motionTransitionColors,
} from "@/lib/motion/classes";
import { ChevronDown, Copy, RotateCcw, Sparkles, Camera } from "lucide-react";

export type EpbSnapshotHistoryPanelProps = {
  snapshots: SnapshotHistoryItem[];
  onApply: (item: SnapshotHistoryItem) => void;
  /** Button label for applying a snapshot to the workspace. */
  applyLabel?: "Apply" | "Restore";
  /** Visual shell — muted matches DD; elevated matches MPA cards. */
  variant?: "muted" | "elevated";
  className?: string;
};

function groupSummary(group: SnapshotHistoryGroup): string {
  if (group.kind === "ai-set") {
    const n = group.items.length;
    return `${group.title} · ${n} option${n !== 1 ? "s" : ""}`;
  }
  return "Workspace snapshot";
}

export function EpbSnapshotHistoryPanel({
  snapshots,
  onApply,
  applyLabel = "Apply",
  variant = "muted",
  className,
}: EpbSnapshotHistoryPanelProps) {
  const groups = groupSnapshotsForHistory(snapshots);
  const newestAiKey =
    groups.find((g): g is Extract<SnapshotHistoryGroup, { kind: "ai-set" }> => g.kind === "ai-set")
      ?.key ?? null;

  // User toggles only — newest AI set stays open by default when unset.
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});

  const isGroupOpen = (key: string) =>
    key in expandedOverrides ? expandedOverrides[key]! : key === newestAiKey;

  const toggleGroup = (key: string) => {
    setExpandedOverrides((prev) => {
      const currentlyOpen = key in prev ? prev[key]! : key === newestAiKey;
      return { ...prev, [key]: !currentlyOpen };
    });
  };

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        motionEnter,
        motionEnterDurNormal,
        variant === "elevated" ? "bg-card shadow-lg" : "bg-muted/30",
        className,
      )}
    >
      <div className="p-4 border-b">
        <h4 className="font-medium text-sm">Snapshot History</h4>
        <p className="text-xs text-muted-foreground">
          {groups.length === 0
            ? "No snapshots yet"
            : `${groups.length} entr${groups.length === 1 ? "y" : "ies"}`}
          <span className="text-muted-foreground/70">
            {" "}
            · AI sets grouped · last 3 kept
          </span>
        </p>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground text-center">
            No snapshots yet. Generated alternatives are saved here automatically,
            or click the camera icon to save your current text.
          </p>
        ) : (
          groups.map((group) => {
            if (group.kind === "manual") {
              return (
                <ManualHistoryRow
                  key={group.key}
                  text={group.item.text}
                  createdAt={group.created_at}
                  applyLabel={applyLabel}
                  onCopy={() => handleCopy(group.item.text)}
                  onApply={() => onApply(group.item)}
                />
              );
            }

            const open = isGroupOpen(group.key);
            return (
              <div key={group.key} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={open}
                  aria-controls={`history-set-${group.batchId}`}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-3 text-left",
                    motionListRow,
                    "hover:bg-muted/50",
                  )}
                >
                  <Sparkles className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{groupSummary(group)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDateTime(group.created_at)}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground shrink-0",
                      motionChevronOpen,
                      open && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>

                <div
                  id={`history-set-${group.batchId}`}
                  className={motionCollapseGrid}
                  data-open={open ? "true" : "false"}
                >
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 space-y-2">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-md border bg-background/80 p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              Option {item.optionIndex}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCopy(item.text)}
                                className={cn(
                                  "h-6 px-1.5 rounded text-[10px] hover:bg-muted inline-flex items-center",
                                  motionPressable,
                                  motionTransitionColors,
                                )}
                                aria-label={`Copy option ${item.optionIndex}`}
                              >
                                <Copy className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onApply(item)}
                                className={cn(
                                  "h-6 px-2 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1",
                                  motionPressable,
                                )}
                                aria-label={`${applyLabel} option ${item.optionIndex}`}
                              >
                                <RotateCcw className="size-3" />
                                {applyLabel}
                              </button>
                            </div>
                          </div>
                          <p className="text-sm select-text cursor-text whitespace-pre-wrap leading-relaxed">
                            {item.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ManualHistoryRow({
  text,
  createdAt,
  applyLabel,
  onCopy,
  onApply,
}: {
  text: string;
  createdAt: string;
  applyLabel: "Apply" | "Restore";
  onCopy: () => void;
  onApply: () => void;
}) {
  return (
    <div className="p-4 border-b last:border-b-0 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          <Camera className="size-3.5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-medium">Workspace snapshot</p>
            <p className="text-[10px] text-muted-foreground">{formatDateTime(createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onCopy}
            className={cn(
              "h-6 px-1.5 rounded text-[10px] hover:bg-muted inline-flex items-center",
              motionPressable,
              motionTransitionColors,
            )}
            aria-label="Copy snapshot to clipboard"
          >
            <Copy className="size-3" />
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onApply}
                className={cn(
                  "h-6 px-2 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1",
                  motionPressable,
                )}
              >
                <RotateCcw className="size-3" />
                {applyLabel}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Replace current workspace with this version</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <p className="text-sm select-text cursor-text whitespace-pre-wrap leading-relaxed">
        {text}
      </p>
    </div>
  );
}
