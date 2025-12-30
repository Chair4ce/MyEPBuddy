"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Target,
  Users,
  Wallet,
  Lightbulb,
  ChevronRight,
  Trophy,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
} from "lucide-react";
import type { EPBAssessmentResult, ACAProficiencyLevel, CategoryAssessment } from "@/lib/constants";
import { ACA_JUNIOR_PROFICIENCY_LEVELS, ACA_SENIOR_PROFICIENCY_LEVELS } from "@/lib/constants";

interface EPBAssessmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: EPBAssessmentResult | null;
  isLoading?: boolean;
}

// Category icon mapping
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  performance: Target,
  followership_leadership: Users,
  whole_airman: Lightbulb,
  // Legacy MPA keys for backward compatibility
  executing_mission: Target,
  leading_people: Users,
  managing_resources: Wallet,
  improving_unit: Lightbulb,
};

// Combined proficiency levels for lookup
const ALL_PROFICIENCY_LEVELS = [
  ...ACA_JUNIOR_PROFICIENCY_LEVELS,
  ...ACA_SENIOR_PROFICIENCY_LEVELS.filter(l => l.value === "significantly_exceeds"),
];

// Get proficiency level info
function getProficiencyInfo(level: ACAProficiencyLevel) {
  return ALL_PROFICIENCY_LEVELS.find((l) => l.value === level) || { 
    value: level, 
    label: level.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    description: "",
    color: "default" 
  };
}

// Proficiency level badge color
function getProficiencyBadgeClass(level: ACAProficiencyLevel): string {
  switch (level) {
    // Top tier levels
    case "far_exceeds":
    case "significantly_exceeds":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    // Above average
    case "exceeds":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    // Standard
    case "meets":
      return "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
    // Below standard
    case "does_not_meet":
      return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
    // Not assessed
    case "not_applicable":
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Get icon for proficiency level
function getProficiencyIcon(level: ACAProficiencyLevel) {
  switch (level) {
    case "far_exceeds":
    case "significantly_exceeds":
      return <Trophy className="size-3.5" />;
    case "exceeds":
      return <TrendingUp className="size-3.5" />;
    case "meets":
      return <CheckCircle2 className="size-3.5" />;
    case "does_not_meet":
      return <AlertCircle className="size-3.5" />;
    case "not_applicable":
      return <FileText className="size-3.5" />;
    default:
      return <CheckCircle2 className="size-3.5" />;
  }
}

// Category Assessment Card
function CategoryAssessmentCard({ category }: { category: CategoryAssessment }) {
  const Icon = CATEGORY_ICONS[category.categoryKey] || Target;
  const levelInfo = getProficiencyInfo(category.overallLevel);

  return (
    <AccordionItem value={category.categoryKey} className="border rounded-lg px-0 data-[state=open]:bg-muted/30">
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3 flex-1 text-left">
          <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="size-4.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{category.categoryLabel}</span>
              <Badge 
                variant="outline" 
                className={cn("text-[10px] gap-1", getProficiencyBadgeClass(category.overallLevel))}
              >
                {getProficiencyIcon(category.overallLevel)}
                {levelInfo.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{category.summary}</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-0">
        <div className="space-y-3">
          {/* Summary */}
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            {category.summary}
          </p>
          
          {/* Subcategory Scores */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Subcategory Assessments
            </span>
            <div className="space-y-2">
              {category.subcategoryScores.map((sub) => {
                const subLevelInfo = getProficiencyInfo(sub.level);
                return (
                  <div 
                    key={sub.alqKey} 
                    className="p-3 border rounded-lg bg-background space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{sub.alqLabel}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge 
                            variant="outline" 
                            className={cn("text-[10px] gap-1 cursor-help", getProficiencyBadgeClass(sub.level))}
                          >
                            {getProficiencyIcon(sub.level)}
                            {subLevelInfo.label}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[250px]">
                          <p className="text-xs">{subLevelInfo.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {sub.justification}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function EPBAssessmentDialog({
  isOpen,
  onClose,
  assessment,
  isLoading = false,
}: EPBAssessmentDialogProps) {
  const [expandedMPAs, setExpandedMPAs] = useState<string[]>([]);

  if (!assessment && !isLoading) {
    return null;
  }

  const overallInfo = assessment ? getProficiencyInfo(assessment.overallStrength) : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-muted/30">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Target className="size-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">EPB Assessment Report</DialogTitle>
                <DialogDescription className="text-xs">
                  AI-powered analysis using the ACA rubric ({assessment?.formUsed || "AF Form 931/932"})
                </DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="size-8 -mt-1 -mr-2">
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="size-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Analyzing your EPB statements...</p>
            <p className="text-xs text-muted-foreground mt-1">This may take 15-30 seconds</p>
          </div>
        )}

        {/* Assessment Results */}
        {assessment && !isLoading && (
          <ScrollArea className="flex-1 max-h-[calc(90vh-120px)]">
            <div className="p-6 space-y-6">
              {/* Overall Summary */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                    {getProficiencyIcon(assessment.overallStrength)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-semibold">Overall Assessment</span>
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs gap-1", getProficiencyBadgeClass(assessment.overallStrength))}
                      >
                        {overallInfo?.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {assessment.overallSummary}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Category Assessments */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <ChevronRight className="size-4" />
                  Performance Area Breakdown
                </h3>
                <Accordion
                  type="multiple"
                  value={expandedMPAs}
                  onValueChange={setExpandedMPAs}
                  className="space-y-2"
                >
                  {assessment.categoryAssessments.map((category) => (
                    <CategoryAssessmentCard key={category.categoryKey} category={category} />
                  ))}
                </Accordion>
              </div>

              {/* Recommendations */}
              {assessment.recommendations && assessment.recommendations.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Lightbulb className="size-4 text-amber-500" />
                      Recommendations for Improvement
                    </h3>
                    <ul className="space-y-2">
                      {assessment.recommendations.map((rec, idx) => (
                        <li 
                          key={idx}
                          className="flex items-start gap-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg"
                        >
                          <span className="size-5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 text-xs font-medium mt-0.5">
                            {idx + 1}
                          </span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Timestamp */}
              <div className="text-center pt-2">
                <p className="text-[10px] text-muted-foreground">
                  Assessment generated {new Date(assessment.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

