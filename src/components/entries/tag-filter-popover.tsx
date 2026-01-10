"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Check, Tag, X, ChevronDown } from "lucide-react";

interface TagFilterPopoverProps {
  availableTags: string[];
  selectedTags: string[];
  onSelectedTagsChange: (tags: string[]) => void;
}

export function TagFilterPopover({
  availableTags,
  selectedTags,
  onSelectedTagsChange,
}: TagFilterPopoverProps) {
  const [open, setOpen] = useState(false);

  function toggleTag(tag: string) {
    if (selectedTags.includes(tag)) {
      onSelectedTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onSelectedTagsChange([...selectedTags, tag]);
    }
  }

  function clearAllTags() {
    onSelectedTagsChange([]);
  }

  function removeTag(tag: string, e: React.MouseEvent) {
    e.stopPropagation();
    onSelectedTagsChange(selectedTags.filter((t) => t !== tag));
  }

  const hasSelectedTags = selectedTags.length > 0;
  const hasTags = availableTags.length > 0;

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 gap-1.5 border-dashed",
              hasSelectedTags && "border-solid"
            )}
            aria-label="Filter by tags"
          >
            <Tag className="size-3.5 text-muted-foreground" />
            {hasSelectedTags ? (
              <span className="hidden sm:inline">
                {selectedTags.length} tag{selectedTags.length !== 1 ? "s" : ""}
              </span>
            ) : (
              <span className="hidden sm:inline">Tags</span>
            )}
            <ChevronDown className="size-3 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start">
          {hasTags ? (
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
              {hasSelectedTags && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllTags}
                    className="w-full h-8 text-xs"
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
                Add tags when creating entries to filter by them here
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Display selected tags as removable badges */}
      {hasSelectedTags && (
        <div className="flex items-center gap-1 flex-wrap">
          {selectedTags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="h-6 gap-1 text-xs cursor-pointer hover:bg-secondary/80"
              onClick={(e) => removeTag(tag, e)}
            >
              {tag}
              <X className="size-3" />
            </Badge>
          ))}
          {selectedTags.length > 3 && (
            <Badge variant="secondary" className="h-6 text-xs">
              +{selectedTags.length - 3}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
