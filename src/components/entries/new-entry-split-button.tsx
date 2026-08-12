"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { motionPressOnly } from "@/lib/motion/classes";
import { ChevronDown, ClipboardPaste, Plus } from "lucide-react";

interface NewEntrySplitButtonProps {
  label?: string;
  onNewEntry: () => void;
  onBulkPaste: () => void;
  className?: string;
}

/** Primary New Entry + menu for Bulk paste. */
export function NewEntrySplitButton({
  label = "New Entry",
  onNewEntry,
  onBulkPaste,
  className,
}: NewEntrySplitButtonProps) {
  return (
    <div className={cn("flex items-center", className)}>
      <Button
        onClick={onNewEntry}
        className={cn("rounded-r-none", motionPressOnly)}
      >
        <Plus className="size-4 mr-2" />
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="More entry options"
            className={cn(
              "rounded-l-none border-l border-primary-foreground/20 px-2",
              motionPressOnly,
            )}
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onBulkPaste}>
            <ClipboardPaste className="size-4 mr-2" />
            Bulk paste
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
