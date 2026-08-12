"use client";

import { Award as AwardIcon, Medal, Star, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AWARD_CATEGORIES,
  AWARD_LEVELS,
  AWARD_QUARTERS,
  AWARD_TYPES,
  SPECIAL_AWARDS_CATALOG,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { motionChip } from "@/lib/motion/classes";
import type {
  AwardCategory,
  AwardLevel,
  AwardQuarter,
  AwardType,
} from "@/types/database";

export type AwardFieldsTeamMemberOption = {
  id: string;
  name: string;
  rank: string | null;
  type: "profile" | "team_member";
};

export type AwardFieldsValue = {
  awardType: AwardType;
  coinPresenter: string;
  coinDescription: string;
  coinDate: string;
  quarter: AwardQuarter;
  awardYear: number;
  awardLevel: AwardLevel;
  awardCategory: AwardCategory;
  awardName: string;
  selectedCatalogAward: string;
  selectedAwardCategory: string;
  isCustomAward: boolean;
  selectedTeamMemberIds: string[];
};

export function emptyAwardFieldsValue(
  year = new Date().getFullYear()
): AwardFieldsValue {
  return {
    awardType: "coin",
    coinPresenter: "",
    coinDescription: "",
    coinDate: new Date().toISOString().split("T")[0],
    quarter: "Q1",
    awardYear: year,
    awardLevel: "squadron",
    awardCategory: "nco",
    awardName: "",
    selectedCatalogAward: "",
    selectedAwardCategory: "",
    isCustomAward: false,
    selectedTeamMemberIds: [],
  };
}

export function validateAwardFields(value: AwardFieldsValue): string | null {
  if (value.awardType === "coin") {
    if (!value.coinPresenter.trim()) return "Please enter who presented the coin";
    if (!value.coinDate) return "Please select when the coin was received";
  }
  if (value.awardType === "special") {
    if (value.isCustomAward && !value.awardName.trim()) {
      return "Please enter an award name";
    }
    if (!value.isCustomAward && !value.selectedCatalogAward) {
      return "Please select an award";
    }
  }
  return null;
}

function getAwardIcon(type: AwardType) {
  switch (type) {
    case "coin":
      return <Medal className="size-4" />;
    case "quarterly":
      return <AwardIcon className="size-4" />;
    case "annual":
      return <Trophy className="size-4" />;
    case "special":
      return <Star className="size-4" />;
    default:
      return <AwardIcon className="size-4" />;
  }
}

type AwardFieldsProps = {
  value: AwardFieldsValue;
  onChange: (next: AwardFieldsValue) => void;
  teamMemberOptions?: AwardFieldsTeamMemberOption[];
  disabled?: boolean;
  idPrefix?: string;
};

export function AwardFields({
  value,
  onChange,
  teamMemberOptions = [],
  disabled = false,
  idPrefix = "award",
}: AwardFieldsProps) {
  const currentYear = new Date().getFullYear();
  const isTeamAward = value.awardCategory === "team";

  const patch = (partial: Partial<AwardFieldsValue>) => {
    onChange({ ...value, ...partial });
  };

  const toggleTeamMember = (id: string) => {
    const set = new Set(value.selectedTeamMemberIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    patch({ selectedTeamMemberIds: Array.from(set) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Award Type</Label>
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          role="radiogroup"
          aria-label="Award type"
        >
          {AWARD_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              role="radio"
              aria-checked={value.awardType === type.value}
              disabled={disabled}
              onClick={() => patch({ awardType: type.value })}
              className={cn(
                motionChip,
                "flex flex-col items-center gap-1 p-3 rounded-lg border-2",
                value.awardType === type.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              {getAwardIcon(type.value)}
              <span className="text-xs font-medium">{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      {value.awardType === "coin" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-coinPresenter`}>Presented By *</Label>
            <Input
              id={`${idPrefix}-coinPresenter`}
              placeholder="e.g., Col Smith, 388 FW/CC"
              value={value.coinPresenter}
              onChange={(e) => patch({ coinPresenter: e.target.value })}
              disabled={disabled}
              aria-required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-coinDate`}>Date Received *</Label>
            <Input
              id={`${idPrefix}-coinDate`}
              type="date"
              value={value.coinDate}
              onChange={(e) => patch({ coinDate: e.target.value })}
              disabled={disabled}
              aria-required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-coinDescription`}>What was it for?</Label>
            <Textarea
              id={`${idPrefix}-coinDescription`}
              placeholder="Brief description of the exceptional performance..."
              value={value.coinDescription}
              onChange={(e) => patch({ coinDescription: e.target.value })}
              rows={3}
              disabled={disabled}
            />
          </div>
        </>
      )}

      {["quarterly", "annual", "special"].includes(value.awardType) && (
        <>
          {value.awardType === "special" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${idPrefix}-isCustomAward`}
                  checked={value.isCustomAward}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    const isCustom = checked === true;
                    patch({
                      isCustomAward: isCustom,
                      selectedCatalogAward: isCustom ? "" : value.selectedCatalogAward,
                      selectedAwardCategory: isCustom ? "" : value.selectedAwardCategory,
                      awardName: isCustom ? value.awardName : "",
                    });
                  }}
                />
                <Label
                  htmlFor={`${idPrefix}-isCustomAward`}
                  className="cursor-pointer text-sm"
                >
                  Enter custom award name
                </Label>
              </div>

              {value.isCustomAward ? (
                <div className="space-y-2">
                  <Label htmlFor={`${idPrefix}-customName`}>Custom Award Name *</Label>
                  <Input
                    id={`${idPrefix}-customName`}
                    placeholder="Enter award name..."
                    value={value.awardName}
                    onChange={(e) => patch({ awardName: e.target.value })}
                    disabled={disabled}
                    aria-required
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Award Category *</Label>
                    <Select
                      value={value.selectedAwardCategory}
                      disabled={disabled}
                      onValueChange={(val) =>
                        patch({
                          selectedAwardCategory: val,
                          selectedCatalogAward: "",
                        })
                      }
                    >
                      <SelectTrigger aria-label="Special award category">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {SPECIAL_AWARDS_CATALOG.map((category) => (
                          <SelectItem key={category.key} value={category.key}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {value.selectedAwardCategory && (
                    <div className="space-y-2">
                      <Label>Award Name *</Label>
                      <SearchableSelect
                        value={value.selectedCatalogAward}
                        onValueChange={(val) =>
                          patch({
                            selectedCatalogAward: val,
                            awardName: "",
                          })
                        }
                        options={
                          SPECIAL_AWARDS_CATALOG.find(
                            (c) => c.key === value.selectedAwardCategory
                          )?.awards.map((award) => ({
                            value: award,
                            label: award,
                          })) ?? []
                        }
                        placeholder="Select an award"
                        searchPlaceholder="Search awards..."
                        emptyMessage="No awards found."
                        aria-label="Award name"
                        disabled={disabled}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {value.awardType === "quarterly" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quarter *</Label>
                <Select
                  value={value.quarter}
                  disabled={disabled}
                  onValueChange={(v) => patch({ quarter: v as AwardQuarter })}
                >
                  <SelectTrigger aria-label="Award quarter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AWARD_QUARTERS.map((q) => (
                      <SelectItem key={q.value} value={q.value}>
                        {q.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year *</Label>
                <Select
                  value={String(value.awardYear)}
                  disabled={disabled}
                  onValueChange={(v) => patch({ awardYear: parseInt(v, 10) })}
                >
                  <SelectTrigger aria-label="Award year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {["annual", "special"].includes(value.awardType) && (
            <div className="space-y-2">
              <Label>Award Year *</Label>
              <Select
                value={String(value.awardYear)}
                disabled={disabled}
                onValueChange={(v) => patch({ awardYear: parseInt(v, 10) })}
              >
                <SelectTrigger className="w-[180px]" aria-label="Award year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(
                    (y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {["quarterly", "annual"].includes(value.awardType) && (
            <>
              <div className="space-y-2">
                <Label>Highest Level Won At</Label>
                <Select
                  value={value.awardLevel}
                  disabled={disabled}
                  onValueChange={(v) => patch({ awardLevel: v as AwardLevel })}
                >
                  <SelectTrigger aria-label="Award level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AWARD_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={value.awardCategory}
                  disabled={disabled}
                  onValueChange={(v) => {
                    const cat = v as AwardCategory;
                    patch({
                      awardCategory: cat,
                      selectedTeamMemberIds:
                        cat !== "team" ? [] : value.selectedTeamMemberIds,
                    });
                  }}
                >
                  <SelectTrigger aria-label="Award category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AWARD_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </>
      )}

      {["quarterly", "annual"].includes(value.awardType) &&
        isTeamAward &&
        teamMemberOptions.length > 0 && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/20 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_2px_4px_rgba(0,0,0,0.02),0_0_0_0.5px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between">
              <Label className="text-sm flex items-center gap-1">
                <Users className="size-3" />
                Team Members
              </Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  disabled={disabled}
                  onClick={() =>
                    patch({
                      selectedTeamMemberIds: teamMemberOptions.map((m) => m.id),
                    })
                  }
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  disabled={disabled}
                  onClick={() => patch({ selectedTeamMemberIds: [] })}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {teamMemberOptions.map((member) => {
                const selected = value.selectedTeamMemberIds.includes(member.id);
                return (
                  <Badge
                    key={member.id}
                    variant={selected ? "default" : "outline"}
                    className={cn(
                      motionChip,
                      "cursor-pointer",
                      selected ? "bg-primary" : "hover:bg-primary/10"
                    )}
                    onClick={() => !disabled && toggleTeamMember(member.id)}
                    role="checkbox"
                    aria-checked={selected}
                    tabIndex={disabled ? -1 : 0}
                    onKeyDown={(e) => {
                      if (disabled) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleTeamMember(member.id);
                      }
                    }}
                  >
                    {member.rank} {member.name}
                  </Badge>
                );
              })}
            </div>
            {value.selectedTeamMemberIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {value.selectedTeamMemberIds.length} team member(s) selected
              </p>
            )}
          </div>
        )}
    </div>
  );
}
