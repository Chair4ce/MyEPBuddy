"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatFormattingViolationNote,
  hasFormattingRemaining,
  type FormattingViolationFlag,
} from "@/lib/formatting-violation-note";
import { Wrench } from "lucide-react";

interface FormattingViolationNoteProps {
  flags?: FormattingViolationFlag[];
  className?: string;
}

/** Non-blocking muted note when generate/revise auto-repaired banned EPB formatting. */
export function FormattingViolationNote({
  flags,
  className,
}: FormattingViolationNoteProps) {
  if (!flags?.length) return null;

  const note = formatFormattingViolationNote(flags);
  if (!note) return null;

  const warnRemaining = hasFormattingRemaining(flags);

  return (
    <div
      role="note"
      aria-label={note}
      className={cn("flex items-start gap-1.5", className)}
    >
      <Badge
        variant="outline"
        className={cn(
          "h-auto max-w-full whitespace-normal px-1.5 py-0.5 text-[10px] font-normal leading-snug gap-1",
          warnRemaining
            ? "border-amber-300/60 text-amber-800 dark:border-amber-700/50 dark:text-amber-300"
            : "border-border/60 text-muted-foreground"
        )}
      >
        <Wrench className="size-3 shrink-0 opacity-70" aria-hidden="true" />
        <span>{note}</span>
      </Badge>
    </div>
  );
}
