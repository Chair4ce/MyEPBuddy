"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { STANDARD_MGAS } from "@/lib/constants";
import {
  Search,
  Plus,
  Zap,
  Filter,
  CheckCircle2,
  Circle,
  Tag,
  ChevronDown,
  Check,
  X,
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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [localSelection, setLocalSelection] = useState<string[]>(selectedIds);

  // Extract unique tags from accomplishments
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    accomplishments.forEach((a) => {
      if (Array.isArray(a.tags)) {
        a.tags.forEach((tag) => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [accomplishments]);

  // Filter accomplishments
  const filteredAccomplishments = useMemo(() => {
    let filtered = accomplishments;

    // Filter by MPA
    if (mpaFilter !== "all") {
      filtered = filtered.filter((a) => a.mpa === mpaFilter);
    }

    // Filter by selected tags (OR logic - match any selected tag)
    if (selectedTags.length > 0) {
      filtered = filtered.filter((a) => {
        if (!Array.isArray(a.tags) || a.tags.length === 0) {
          return false;
        }
        return selectedTags.some((tag) => a.tags.includes(tag));
      });
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.action_verb.toLowerCase().includes(query) ||
          a.details.toLowerCase().includes(query) ||
          (a.impact && a.impact.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [accomplishments, mpaFilter, selectedTags, searchQuery]);

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Clear all tags
  const clearAllTags = () => {
    setSelectedTags([]);
  };

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
                  statementNumber === 2 && "border-primary/50 text-primary"
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
          <div className="flex flex-col gap-2">
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
              
              {/* Tag Filter */}
              <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 gap-1.5 border-dashed shrink-0",
                      selectedTags.length > 0 && "border-solid"
                    )}
                    aria-label="Filter by tags"
                  >
                    <Tag className="size-3.5 text-muted-foreground" />
                    {selectedTags.length > 0 ? (
                      <span>{selectedTags.length}</span>
                    ) : (
                      <span>Tags</span>
                    )}
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="end">
                  {availableTags.length > 0 ? (
                    <Command>
                      <CommandInput placeholder="Search tags..." />
                      <CommandList>
                        <CommandEmpty>No tags found.</CommandEmpty>
                        <CommandGroup>
                          {availableTags.map((tag) => {
                            const isSelected = selectedTags.includes(tag);
                            return (
                              <CommandItem
                                key={tag}
                                value={tag}
                                onSelect={() => toggleTag(tag)}
                                className="cursor-pointer"
                              >
                                <div
                                  className={cn(
                                    "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                                    isSelected
                                      ? "bg-primary text-primary-foreground"
                                      : "opacity-50 [&_svg]:invisible"
                                  )}
                                >
                                  <Check className="size-3" />
                                </div>
                                <span className="truncate">{tag}</span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                      {selectedTags.length > 0 && (
                        <div className="border-t p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAllTags}
                            className="w-full h-7 text-xs"
                          >
                            Clear all
                          </Button>
                        </div>
                      )}
                    </Command>
                  ) : (
                    <div className="p-4 text-center">
                      <Tag className="size-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No tags yet
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Add tags to entries to filter here
                      </p>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Selected tags display */}
            {selectedTags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {selectedTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="h-6 gap-1 text-xs cursor-pointer hover:bg-secondary/80"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                    <X className="size-3" />
                  </Badge>
                ))}
              </div>
            )}
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {action.action_verb}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {getMpaLabel(action.mpa).split(" ")[0]}
                            </Badge>
                            {Array.isArray(action.tags) && action.tags.length > 0 && (
                              <div className="flex items-center gap-1">
                                {action.tags.slice(0, 2).map((tag) => (
                                  <Badge 
                                    key={tag} 
                                    variant="secondary" 
                                    className="text-[10px] h-4 px-1.5"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                                {action.tags.length > 2 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{action.tags.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {action.details}
                          </p>
                          {action.impact && (
                            <p className="text-xs text-muted-foreground/70 line-clamp-1">
                              Impact: {action.impact}
                            </p>
                          )}
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
