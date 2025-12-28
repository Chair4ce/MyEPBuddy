"use client";

import { useState } from "react";
import type { FeedAccomplishment } from "@/stores/team-feed-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  User,
  Briefcase,
  Building,
  Target,
  BarChart3,
  Tag,
  ChevronDown,
  ChevronUp,
  GitBranch,
} from "lucide-react";
import { ENTRY_MGAS } from "@/lib/constants";
import { ChainOfCommandDisplay } from "./chain-of-command-display";

interface AccomplishmentDetailDialogProps {
  accomplishment: FeedAccomplishment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccomplishmentDetailDialog({
  accomplishment,
  open,
  onOpenChange,
}: AccomplishmentDetailDialogProps) {
  const [showChain, setShowChain] = useState(true);

  if (!accomplishment) return null;

  const mpaLabel =
    ENTRY_MGAS.find((m) => m.key === accomplishment.mpa)?.label ||
    accomplishment.mpa;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl max-h-[90dvh] overflow-y-auto p-0">
        {/* Header with author info */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b p-4 sm:p-6">
          <DialogHeader className="text-left">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-semibold text-primary shrink-0">
                  {accomplishment.author_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg truncate">
                    {accomplishment.author_rank && (
                      <span className="text-muted-foreground">
                        {accomplishment.author_rank}{" "}
                      </span>
                    )}
                    {accomplishment.author_name}
                  </DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm mt-1">
                    {accomplishment.author_afsc && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="size-3" />
                        {accomplishment.author_afsc}
                      </span>
                    )}
                    {accomplishment.author_unit && (
                      <span className="flex items-center gap-1">
                        <Building className="size-3" />
                        {accomplishment.author_unit}
                      </span>
                    )}
                  </DialogDescription>
                </div>
              </div>
              <Badge variant="outline" className="shrink-0">
                {mpaLabel}
              </Badge>
            </div>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* Date and action */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="size-4" />
              <span>{formatDate(accomplishment.date)}</span>
            </div>
            <span className="text-muted-foreground/40">•</span>
            <span className="text-muted-foreground">
              {formatTimeAgo(accomplishment.created_at)}
            </span>
            <span className="text-muted-foreground/40">•</span>
            <Badge variant="secondary" className="font-medium">
              {accomplishment.action_verb}
            </Badge>
          </div>

          {/* Details */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Target className="size-4 text-primary" />
              What They Did
            </h4>
            <p className="text-sm leading-relaxed pl-6">
              {accomplishment.details}
            </p>
          </div>

          {/* Impact */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="size-4 text-emerald-500" />
              Impact & Results
            </h4>
            <p className="text-sm leading-relaxed pl-6">
              {accomplishment.impact}
            </p>
          </div>

          {/* Metrics */}
          {accomplishment.metrics && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="size-4 text-blue-500" />
                Metrics
              </h4>
              <p className="text-sm leading-relaxed pl-6 font-mono text-blue-600 dark:text-blue-400">
                {accomplishment.metrics}
              </p>
            </div>
          )}

          {/* Tags */}
          {accomplishment.tags && accomplishment.tags.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Tag className="size-4 text-orange-500" />
                Tags
              </h4>
              <div className="flex flex-wrap gap-1.5 pl-6">
                {accomplishment.tags.map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Chain of Command */}
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between hover:bg-muted/50"
              onClick={() => setShowChain(!showChain)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <GitBranch className="size-4 text-violet-500" />
                Chain of Command
              </span>
              {showChain ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </Button>

            {showChain && (
              <ChainOfCommandDisplay
                accomplishment={accomplishment}
                className="mt-2"
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

