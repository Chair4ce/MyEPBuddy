"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Search,
  X,
  Users,
  UserCheck,
  User,
} from "lucide-react";
import type { Profile, ManagedMember, Rank } from "@/types/database";

// Unified member option for both real profiles and managed members
export interface TeamMemberOption {
  id: string; // For profiles: profile.id, for managed: `managed:${member.id}`
  actualId: string; // The actual database ID
  fullName: string;
  rank: Rank | null;
  afsc: string | null;
  isManagedMember: boolean;
}

interface TeamMemberSelectorProps {
  subordinates: Profile[];
  managedMembers: ManagedMember[];
  selectedMemberIds: string[];
  onSelectionChange: (memberIds: string[]) => void;
  disabled?: boolean;
}

export function TeamMemberSelector({
  subordinates,
  managedMembers,
  selectedMemberIds,
  onSelectionChange,
  disabled = false,
}: TeamMemberSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Build unified member options
  const memberOptions: TeamMemberOption[] = useMemo(() => {
    const options: TeamMemberOption[] = [];

    // Add real subordinates
    subordinates.forEach((sub) => {
      options.push({
        id: sub.id,
        actualId: sub.id,
        fullName: sub.full_name || "Unknown",
        rank: sub.rank as Rank | null,
        afsc: sub.afsc,
        isManagedMember: false,
      });
    });

    // Add managed members
    managedMembers.forEach((member) => {
      options.push({
        id: `managed:${member.id}`,
        actualId: member.id,
        fullName: member.full_name,
        rank: member.rank as Rank | null,
        afsc: member.afsc,
        isManagedMember: true,
      });
    });

    return options;
  }, [subordinates, managedMembers]);

  // Filter by search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return memberOptions;

    const query = searchQuery.toLowerCase();
    return memberOptions.filter((option) => {
      const nameMatch = option.fullName.toLowerCase().includes(query);
      const rankMatch = option.rank?.toLowerCase().includes(query);
      const afscMatch = option.afsc?.toLowerCase().includes(query);
      return nameMatch || rankMatch || afscMatch;
    });
  }, [memberOptions, searchQuery]);

  // Toggle member selection
  const toggleMember = (memberId: string) => {
    if (disabled) return;

    if (selectedMemberIds.includes(memberId)) {
      onSelectionChange(selectedMemberIds.filter((id) => id !== memberId));
    } else {
      onSelectionChange([...selectedMemberIds, memberId]);
    }
  };

  // Select/deselect all visible
  const selectAll = () => {
    if (disabled) return;
    const allIds = filteredOptions.map((o) => o.id);
    const newSelection = [...new Set([...selectedMemberIds, ...allIds])];
    onSelectionChange(newSelection);
  };

  const deselectAll = () => {
    if (disabled) return;
    const filteredIds = new Set(filteredOptions.map((o) => o.id));
    onSelectionChange(selectedMemberIds.filter((id) => !filteredIds.has(id)));
  };

  // Get selected member info for display
  const selectedMembers = useMemo(() => {
    return memberOptions.filter((o) => selectedMemberIds.includes(o.id));
  }, [memberOptions, selectedMemberIds]);

  // Check if all filtered are selected
  const allFilteredSelected = filteredOptions.length > 0 && 
    filteredOptions.every((o) => selectedMemberIds.includes(o.id));

  if (memberOptions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <Users className="size-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          No team members available to select.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Add subordinates or managed members in the Team page first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 transition-all duration-200 ease-in-out">
      {/* Search and bulk actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search team members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-8 text-sm"
            disabled={disabled}
            aria-label="Search team members"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={allFilteredSelected ? deselectAll : selectAll}
              disabled={disabled || filteredOptions.length === 0}
              className="h-8 px-2 text-xs shrink-0"
            >
              {allFilteredSelected ? "Deselect All" : "Select All"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {allFilteredSelected ? "Deselect all visible members" : "Select all visible members"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Member list */}
      <div className="rounded-md border overflow-hidden">
        <ScrollArea className="h-[200px]">
          <div className="flex flex-col gap-1 p-1">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No members match your search
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selectedMemberIds.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={cn(
                      "flex items-center gap-3 h-10 px-2 rounded-md cursor-pointer transition-colors",
                      isSelected ? "bg-primary/10" : "hover:bg-muted",
                      disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleMember(option.id)}
                      disabled={disabled}
                      className="shrink-0"
                      aria-label={`Select ${option.fullName}`}
                    />
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      {option.isManagedMember && (
                        <User className="size-3 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">
                        {option.rank && `${option.rank} `}
                        {option.fullName}
                      </span>
                      {option.afsc && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          · {option.afsc}
                        </span>
                      )}
                    </div>
                    <UserCheck 
                      className={cn(
                        "size-4 shrink-0 transition-opacity duration-150",
                        isSelected ? "text-primary opacity-100" : "opacity-0"
                      )} 
                    />
                  </label>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Selection summary - always visible to prevent layout shift */}
      <div className="flex items-center justify-between text-xs text-muted-foreground h-5">
        <span>
          {selectedMemberIds.length} of {memberOptions.length} selected
        </span>
        <button
          onClick={() => onSelectionChange([])}
          disabled={disabled || selectedMemberIds.length === 0}
          className={cn(
            "text-primary hover:underline transition-opacity duration-150",
            selectedMemberIds.length === 0 ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
        >
          Clear all
        </button>
      </div>

      {/* Selected members badges - with smooth height transition */}
      <div 
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          selectedMembers.length > 0 ? "max-h-24 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="flex flex-wrap gap-1 pt-1 border-t">
          {selectedMembers.map((member) => (
            <Badge
              key={member.id}
              variant="secondary"
              className="gap-1 pr-1 h-6"
            >
              {member.isManagedMember && (
                <User className="size-2.5 text-muted-foreground" />
              )}
              <span className="text-[10px]">
                {member.rank && `${member.rank} `}
                {member.fullName}
              </span>
              <button
                onClick={() => toggleMember(member.id)}
                disabled={disabled}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50"
                aria-label={`Remove ${member.fullName}`}
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
