"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  Copy,
  Trash2,
  Search,
  X,
  Building2,
  User,
  Star,
  Filter,
  FileText,
  Check,
} from "lucide-react";
import type { DutyDescriptionTemplate } from "@/types/database";
import { formatDateDefault } from "@/lib/format";

interface DutyDescriptionTemplatesPanelProps {
  templates: DutyDescriptionTemplate[];
  onApply: (text: string) => void;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}

export function DutyDescriptionTemplatesPanel({
  templates,
  onApply,
  onDelete,
  onClose,
}: DutyDescriptionTemplatesPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [officeFilter, setOfficeFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [rankFilter, setRankFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Extract unique labels for filter dropdowns
  const uniqueLabels = useMemo(() => {
    const offices = new Set<string>();
    const roles = new Set<string>();
    const ranks = new Set<string>();

    templates.forEach((t) => {
      if (t.office_label) offices.add(t.office_label);
      if (t.role_label) roles.add(t.role_label);
      if (t.rank_label) ranks.add(t.rank_label);
    });

    return {
      offices: Array.from(offices).sort(),
      roles: Array.from(roles).sort(),
      ranks: Array.from(ranks).sort(),
    };
  }, [templates]);

  // Filter and search templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      // Apply label filters
      if (officeFilter && template.office_label !== officeFilter) return false;
      if (roleFilter && template.role_label !== roleFilter) return false;
      if (rankFilter && template.rank_label !== rankFilter) return false;

      // Apply search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText = template.template_text.toLowerCase().includes(query);
        const matchesOffice = template.office_label?.toLowerCase().includes(query);
        const matchesRole = template.role_label?.toLowerCase().includes(query);
        const matchesRank = template.rank_label?.toLowerCase().includes(query);
        const matchesNote = template.note?.toLowerCase().includes(query);

        if (!matchesText && !matchesOffice && !matchesRole && !matchesRank && !matchesNote) {
          return false;
        }
      }

      return true;
    });
  }, [templates, searchQuery, officeFilter, roleFilter, rankFilter]);

  // Check if any filters are active
  const hasActiveFilters = officeFilter || roleFilter || rankFilter;

  // Clear all filters
  const clearFilters = () => {
    setOfficeFilter(null);
    setRoleFilter(null);
    setRankFilter(null);
    setSearchQuery("");
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!onDelete) return;
    setDeletingId(id);
    try {
      await onDelete(id);
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setDeletingId(null);
    }
  };

  // Handle apply
  const handleApply = (text: string) => {
    onApply(text);
    toast.success("Template applied");
    onClose();
  };

  return (
    <div className="rounded-lg border bg-muted/30 animate-in fade-in-0 duration-200">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            <h4 className="font-medium text-sm">Saved Templates</h4>
            <Badge variant="secondary" className="text-[10px]">
              {filteredTemplates.length}
            </Badge>
          </div>
          <button type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "size-7 rounded-md inline-flex items-center justify-center transition-colors",
              showFilters || hasActiveFilters
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground"
            )}
            aria-label="Toggle filters"
          >
            <Filter className="size-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-8 text-sm"
            aria-label="Search templates"
          />
          {searchQuery && (
            <button type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-3 border-b bg-muted/50 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Filter by:</span>
            {hasActiveFilters && (
              <button type="button"
                onClick={clearFilters}
                className="text-[10px] text-primary hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Office filter */}
            {uniqueLabels.offices.length > 0 && (
              <div className="flex-1 min-w-[100px]">
                <label htmlFor="template-office-filter" className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                  <Building2 className="size-3" />
                  Office
                </label>
                <select
                  id="template-office-filter"
                  value={officeFilter || ""}
                  onChange={(e) => setOfficeFilter(e.target.value || null)}
                  className="w-full h-7 text-xs rounded-md border bg-background px-2"
                >
                  <option value="">All</option>
                  {uniqueLabels.offices.map((office) => (
                    <option key={office} value={office}>
                      {office}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Role filter */}
            {uniqueLabels.roles.length > 0 && (
              <div className="flex-1 min-w-[100px]">
                <label htmlFor="template-role-filter" className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                  <User className="size-3" />
                  Role
                </label>
                <select
                  id="template-role-filter"
                  value={roleFilter || ""}
                  onChange={(e) => setRoleFilter(e.target.value || null)}
                  className="w-full h-7 text-xs rounded-md border bg-background px-2"
                >
                  <option value="">All</option>
                  {uniqueLabels.roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Rank filter */}
            {uniqueLabels.ranks.length > 0 && (
              <div className="flex-1 min-w-[100px]">
                <label htmlFor="template-rank-filter" className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                  <Star className="size-3" />
                  Rank
                </label>
                <select
                  id="template-rank-filter"
                  value={rankFilter || ""}
                  onChange={(e) => setRankFilter(e.target.value || null)}
                  className="w-full h-7 text-xs rounded-md border bg-background px-2"
                >
                  <option value="">All</option>
                  {uniqueLabels.ranks.map((rank) => (
                    <option key={rank} value={rank}>
                      {rank}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active filter badges */}
      {hasActiveFilters && !showFilters && (
        <div className="px-3 py-2 border-b flex flex-wrap gap-1">
          {officeFilter && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Building2 className="size-2.5" />
              {officeFilter}
              <button type="button"
                onClick={() => setOfficeFilter(null)}
                className="ml-0.5 hover:text-destructive"
                aria-label={`Remove office filter: ${officeFilter}`}
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          )}
          {roleFilter && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <User className="size-2.5" />
              {roleFilter}
              <button type="button"
                onClick={() => setRoleFilter(null)}
                className="ml-0.5 hover:text-destructive"
                aria-label={`Remove role filter: ${roleFilter}`}
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          )}
          {rankFilter && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Star className="size-2.5" />
              {rankFilter}
              <button type="button"
                onClick={() => setRankFilter(null)}
                className="ml-0.5 hover:text-destructive"
                aria-label={`Remove rank filter: ${rankFilter}`}
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Templates list */}
      <div className="max-h-72 overflow-y-auto">
        {filteredTemplates.length === 0 ? (
          <div className="p-6 text-center">
            <FileText className="size-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {templates.length === 0
                ? "No saved templates yet. Save your favorite duty descriptions for reuse."
                : "No templates match your filters."}
            </p>
            {hasActiveFilters && (
              <button type="button"
                onClick={clearFilters}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="p-3 border-b last:border-0 hover:bg-muted/50 transition-colors"
            >
              {/* Labels row */}
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                {template.office_label && (
                  <Badge variant="outline" className="text-[10px] gap-1 py-0">
                    <Building2 className="size-2.5" />
                    {template.office_label}
                  </Badge>
                )}
                {template.role_label && (
                  <Badge variant="outline" className="text-[10px] gap-1 py-0">
                    <User className="size-2.5" />
                    {template.role_label}
                  </Badge>
                )}
                {template.rank_label && (
                  <Badge variant="outline" className="text-[10px] gap-1 py-0">
                    <Star className="size-2.5" />
                    {template.rank_label}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {formatDateDefault(template.created_at)}
                </span>
              </div>

              {/* Template text */}
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {template.template_text}
              </p>

              {/* Note if exists */}
              {template.note && (
                <p className="text-[10px] text-muted-foreground/70 italic mb-2 line-clamp-1">
                  Note: {template.note}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 justify-end">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(template.template_text);
                        toast.success("Copied to clipboard");
                      }}
                      className="h-6 px-2 rounded text-[10px] hover:bg-muted transition-colors inline-flex items-center"
                      aria-label="Copy template text"
                    >
                      <Copy className="size-3 mr-1" />
                      Copy
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy to clipboard</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button"
                      onClick={() => handleApply(template.template_text)}
                      className="h-6 px-2 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center"
                      aria-label="Apply this template"
                    >
                      <Check className="size-3 mr-1" />
                      Apply
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Use this template</TooltipContent>
                </Tooltip>

                {onDelete && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button"
                        onClick={() => handleDelete(template.id)}
                        disabled={deletingId === template.id}
                        className="h-6 px-2 rounded text-[10px] hover:bg-destructive/10 text-destructive transition-colors inline-flex items-center disabled:opacity-50"
                        aria-label="Delete template"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Delete template</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
