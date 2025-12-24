"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STANDARD_MGAS } from "@/lib/constants";
import {
  Search,
  Plus,
  Zap,
  Filter,
  CheckCircle2,
  Circle,
} from "lucide-react";
import type { Accomplishment } from "@/types/database";

interface ActionSelectorSheetProps {
  accomplishments: Accomplishment[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  targetMpa?: string;
  statementNumber?: 1 | 2;
  cycleYear: number;
  trigger?: React.ReactNode;
}

export function ActionSelectorSheet({
  accomplishments,
  selectedIds,
  onSelectionChange,
  targetMpa,
  statementNumber,
  cycleYear,
  trigger,
}: ActionSelectorSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mpaFilter, setMpaFilter] = useState<string>(targetMpa || "all");
  const [localSelection, setLocalSelection] = useState<string[]>(selectedIds);

  // Filter accomplishments
  const filteredAccomplishments = useMemo(() => {
    let filtered = accomplishments;

    // Filter by MPA
    if (mpaFilter !== "all") {
      filtered = filtered.filter((a) => a.mpa === mpaFilter);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.action_verb.toLowerCase().includes(query) ||
          a.details.toLowerCase().includes(query) ||
          a.impact.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [accomplishments, mpaFilter, searchQuery]);

  // Toggle selection
  const toggleSelection = (id: string) => {
    setLocalSelection((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Select all visible
  const selectAllVisible = () => {
    const visibleIds = filteredAccomplishments.map((a) => a.id);
    setLocalSelection((prev) => {
      const newSelection = new Set(prev);
      visibleIds.forEach((id) => newSelection.add(id));
      return Array.from(newSelection);
    });
  };

  // Clear selection
  const clearSelection = () => {
    setLocalSelection([]);
  };

  // Apply selection and close
  const applySelection = () => {
    onSelectionChange(localSelection);
    setIsOpen(false);
  };

  // Reset local selection when opening
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalSelection(selectedIds);
    }
    setIsOpen(open);
  };

  // Get MPA label
  const getMpaLabel = (mpa: string) => {
    return STANDARD_MGAS.find((m) => m.key === mpa)?.label || mpa;
  };

  // Default trigger if none provided - using plain button to avoid ref issues
  const defaultTrigger = (
    <button className="inline-flex items-center justify-center rounded-md h-8 px-3 text-sm border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
      <Plus className="size-3.5 mr-1.5" />
      Load Actions
      {selectedIds.length > 0 && (
        <Badge className="ml-1.5 size-5 p-0 justify-center">
          {selectedIds.length}
        </Badge>
      )}
    </button>
  );

  // Render trigger with onClick to open dialog
  // This avoids the DialogTrigger asChild ref composition issue
  const triggerElement = trigger || defaultTrigger;
  const triggerWithClick = (
    <span onClick={() => setIsOpen(true)} className="cursor-pointer">
      {triggerElement}
    </span>
  );

  return (
    <>
      {triggerWithClick}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-primary" />
            Select Performance Actions
            {statementNumber && (
              <Badge
                variant="outline"
                className={cn(
                  statementNumber === 1 && "border-blue-500/50 text-blue-600",
                  statementNumber === 2 && "border-purple-500/50 text-purple-600"
                )}
              >
                Statement {statementNumber}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Choose actions to load as reference while writing your statement.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4 py-4">
          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search actions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={mpaFilter} onValueChange={setMpaFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Filter MPA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All MPAs</SelectItem>
                {STANDARD_MGAS.filter((m) => m.key !== "hlr_assessment").map((mpa) => (
                  <SelectItem key={mpa.key} value={mpa.key}>
                    {mpa.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quick actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-7 px-2.5 rounded-md text-xs hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center"
                onClick={selectAllVisible}
              >
                Select All ({filteredAccomplishments.length})
              </button>
              {localSelection.length > 0 && (
                <button
                  type="button"
                  className="h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center"
                  onClick={clearSelection}
                >
                  Clear
                </button>
              )}
            </div>
            <Badge variant="secondary" className="text-xs">
              {localSelection.length} selected
            </Badge>
          </div>

          {/* Action list */}
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {filteredAccomplishments.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No actions found
                  </p>
                  {searchQuery && (
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                      onClick={() => setSearchQuery("")}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                filteredAccomplishments.map((action) => {
                  const isSelected = localSelection.includes(action.id);
                  return (
                    <button
                      key={action.id}
                      onClick={() => toggleSelection(action.id)}
                      className={cn(
                        "w-full p-3 rounded-lg border text-left transition-all",
                        isSelected
                          ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                          : "bg-card hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5">
                          {isSelected ? (
                            <CheckCircle2 className="size-4 text-primary" />
                          ) : (
                            <Circle className="size-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {action.action_verb}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {getMpaLabel(action.mpa).split(" ")[0]}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {action.details}
                          </p>
                          <p className="text-xs text-muted-foreground/70 line-clamp-1">
                            Impact: {action.impact}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <button
            type="button"
            className="h-9 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center"
            onClick={() => setIsOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center"
            onClick={applySelection}
          >
            Load {localSelection.length} Action{localSelection.length !== 1 && "s"}
          </button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}
