"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  HelpCircle,
  TrendingUp,
  Users,
  Award,
  Hash,
  Maximize2,
  Sparkles,
  RefreshCw,
  X,
  Lightbulb,
  CheckCircle2,
  FileText,
  ArrowRight,
} from "lucide-react";
import {
  useClarifyingQuestionsStore,
  QUESTION_CATEGORY_LABELS,
  type ClarifyingQuestion,
  type QuestionSourceContext,
} from "@/stores/clarifying-questions-store";

interface ClarifyingQuestionsModalProps {
  onRegenerate: (clarifyingContext: string, mpaKey: string) => void;
  isRegenerating?: boolean;
}

// Category icon mapping
const CATEGORY_ICONS: Record<ClarifyingQuestion["category"], React.ElementType> = {
  impact: TrendingUp,
  scope: Maximize2,
  leadership: Users,
  recognition: Award,
  metrics: Hash,
  general: HelpCircle,
};

// Category color mapping
const CATEGORY_COLORS: Record<ClarifyingQuestion["category"], string> = {
  impact: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  scope: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  leadership: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  recognition: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  metrics: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  general: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

/**
 * Displays a single sentence's context (input + generated) with its questions
 */
function SentenceQuestionsSection({
  sentenceNumber,
  sourceContext,
  questions,
  localAnswers,
  onAnswerChange,
  isOnlySentence,
}: {
  sentenceNumber: 1 | 2 | "general";
  sourceContext?: QuestionSourceContext;
  questions: ClarifyingQuestion[];
  localAnswers: Record<string, string>;
  onAnswerChange: (questionId: string, value: string) => void;
  isOnlySentence: boolean;
}) {
  // Get sentence-specific content
  const generated = sentenceNumber === 1 
    ? sourceContext?.statement1Generated 
    : sentenceNumber === 2 
      ? sourceContext?.statement2Generated 
      : undefined;

  // Color scheme based on sentence
  const colorScheme = sentenceNumber === 1 
    ? { border: "border-primary/50", bg: "bg-primary/5", accent: "border-primary", accentBg: "bg-primary/10", badge: "bg-primary text-primary-foreground" }
    : sentenceNumber === 2
      ? { border: "border-blue-500/50", bg: "bg-blue-500/5", accent: "border-blue-500", accentBg: "bg-blue-500/10", badge: "bg-blue-500 text-white" }
      : { border: "border-muted", bg: "bg-muted/30", accent: "border-muted-foreground/30", accentBg: "bg-muted/50", badge: "bg-muted text-muted-foreground" };

  const sectionTitle = sentenceNumber === "general" 
    ? "General"
    : isOnlySentence 
      ? "Your Statement" 
      : `Sentence ${sentenceNumber}`;

  return (
    <div className={cn("rounded-lg border-2 p-4 space-y-4", colorScheme.border, colorScheme.bg)}>
      {/* Header row with sentence badge and generated text */}
      <div className="space-y-2">
        <Badge className={cn("text-xs font-semibold", colorScheme.badge)}>
          {sectionTitle}
        </Badge>
        
        {/* Generated text - compact display */}
        {sentenceNumber !== "general" && generated && (
          <p className={cn(
            "text-sm text-foreground leading-relaxed rounded-md px-3 py-2 border-l-4",
            colorScheme.accentBg,
            colorScheme.accent
          )}>
            {generated}
          </p>
        )}
        
        {sentenceNumber === "general" && (
          <p className="text-xs text-muted-foreground">
            These questions apply to your entire statement.
          </p>
        )}
      </div>

      {/* Questions - full width layout */}
      <div className="space-y-5">
        {questions.map((question) => {
          const Icon = CATEGORY_ICONS[question.category];
          const categoryColor = CATEGORY_COLORS[question.category];
          
          return (
            <div key={question.id} className="space-y-2">
              {/* Category badge on its own row */}
              <Badge variant="outline" className={cn("gap-1.5", categoryColor)}>
                <Icon className="h-3 w-3" />
                {QUESTION_CATEGORY_LABELS[question.category]}
              </Badge>
              
              {/* Question text - full width */}
              <div className="space-y-1">
                <Label className="text-sm font-medium leading-relaxed block">
                  {question.question}
                </Label>
                {question.hint && (
                  <p className="text-xs text-muted-foreground">
                    💡 {question.hint}
                  </p>
                )}
              </div>
              
              {/* Answer textarea - full width */}
              <Textarea
                placeholder="Your answer (optional)..."
                value={localAnswers[question.id] || ""}
                onChange={(e) => onAnswerChange(question.id, e.target.value)}
                className="min-h-[60px] resize-none text-sm w-full"
                aria-label={question.question}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ClarifyingQuestionsModal({
  onRegenerate,
  isRegenerating = false,
}: ClarifyingQuestionsModalProps) {
  const {
    isModalOpen,
    closeModal,
    getActiveQuestionSet,
    updateAnswer,
    updateAdditionalContext,
    buildClarifyingContext,
    removeQuestionSet,
  } = useClarifyingQuestionsStore();

  const questionSet = getActiveQuestionSet();
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [additionalContext, setAdditionalContext] = useState("");

  // Initialize local state from store when modal opens
  useEffect(() => {
    if (isModalOpen && questionSet) {
      const answers: Record<string, string> = {};
      questionSet.questions.forEach(q => {
        answers[q.id] = q.answer;
      });
      setLocalAnswers(answers);
      setAdditionalContext(questionSet.additionalContext);
    }
  }, [isModalOpen, questionSet]);

  // Handle modal close
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal();
    }
  };

  // Handle answer change
  const handleAnswerChange = (questionId: string, value: string) => {
    setLocalAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  // Handle regenerate
  const handleRegenerate = () => {
    if (!questionSet) {
      console.error("[ClarifyingQuestionsModal] No questionSet available");
      return;
    }

    // Capture mpaKey before any state changes
    const mpaKey = questionSet.mpaKey;
    console.log("[ClarifyingQuestionsModal] handleRegenerate called for MPA:", mpaKey);

    // Save answers to store
    Object.entries(localAnswers).forEach(([questionId, answer]) => {
      updateAnswer(questionSet.id, questionId, answer);
    });
    updateAdditionalContext(questionSet.id, additionalContext);

    // Build context and trigger regeneration
    const context = buildClarifyingContext(questionSet.id);
    console.log("[ClarifyingQuestionsModal] Built context:", context.substring(0, 200) + "...");
    
    // Add local additional context if different from store
    let finalContext = context;
    if (additionalContext.trim() && !context.includes(additionalContext)) {
      finalContext = `${context}\n\n=== ADDITIONAL CONTEXT FROM USER ===\n${additionalContext}`;
    }

    console.log("[ClarifyingQuestionsModal] Calling onRegenerate with mpaKey:", mpaKey);
    // Pass both context and mpaKey to ensure regeneration works
    onRegenerate(finalContext, mpaKey);
    
    // Remove question set after regeneration
    removeQuestionSet(questionSet.id);
    closeModal();
  };

  // Handle dismiss
  const handleDismiss = () => {
    if (questionSet) {
      removeQuestionSet(questionSet.id);
    }
    closeModal();
  };

  // Count answered questions
  const answeredCount = Object.values(localAnswers).filter(a => a.trim().length > 0).length;
  const hasAnyInput = answeredCount > 0 || additionalContext.trim().length > 0;

  if (!questionSet) return null;

  // Group questions by sentence number
  const sentence1Questions = questionSet.questions.filter(q => q.sentenceNumber === 1);
  const sentence2Questions = questionSet.questions.filter(q => q.sentenceNumber === 2);
  const generalQuestions = questionSet.questions.filter(q => !q.sentenceNumber);

  // Determine if we have 2 sentences
  const hasSentence2 = !!(questionSet.sourceContext?.statement2Input || questionSet.sourceContext?.statement2Generated);
  const isOnlySentence = !hasSentence2;

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col overflow-hidden p-0" style={{ maxHeight: "min(85vh, 750px)" }}>
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b bg-background">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 shrink-0">
              <Lightbulb className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg">Enhance Your Statement</DialogTitle>
              <DialogDescription className="text-sm">
                {hasSentence2 
                  ? "Answer questions for each sentence to add more impact."
                  : "Answer questions below to add more impact to your statement."}
              </DialogDescription>
            </div>
          </div>
          {/* MPA Label */}
          {questionSet.sourceContext?.mpaLabel && (
            <Badge variant="secondary" className="text-xs font-medium w-fit mt-2">
              <FileText className="h-3 w-3 mr-1" />
              {questionSet.sourceContext.mpaLabel}
            </Badge>
          )}
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-5">
            {/* Instructions */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Questions are optional</span> — 
                answer any that apply to add specific metrics, scope, or impact.
                {hasSentence2 && (
                  <span className="block mt-1 text-xs">
                    Each section below shows which sentence the questions are for.
                  </span>
                )}
              </p>
            </div>

            {/* Sentence 1 Questions */}
            {sentence1Questions.length > 0 && (
              <SentenceQuestionsSection
                sentenceNumber={1}
                sourceContext={questionSet.sourceContext}
                questions={sentence1Questions}
                localAnswers={localAnswers}
                onAnswerChange={handleAnswerChange}
                isOnlySentence={isOnlySentence}
              />
            )}

            {/* Sentence 2 Questions */}
            {sentence2Questions.length > 0 && (
              <SentenceQuestionsSection
                sentenceNumber={2}
                sourceContext={questionSet.sourceContext}
                questions={sentence2Questions}
                localAnswers={localAnswers}
                onAnswerChange={handleAnswerChange}
                isOnlySentence={false}
              />
            )}

            {/* General Questions (no specific sentence) */}
            {generalQuestions.length > 0 && (
              <SentenceQuestionsSection
                sentenceNumber="general"
                sourceContext={questionSet.sourceContext}
                questions={generalQuestions}
                localAnswers={localAnswers}
                onAnswerChange={handleAnswerChange}
                isOnlySentence={isOnlySentence}
              />
            )}

            <Separator />

            {/* Additional context */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1 bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                  <Sparkles className="h-3 w-3" />
                  Additional Context
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Any other details not covered by the questions above?
              </p>
              <Textarea
                placeholder="Any other context that could help enhance your statement..."
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                className="min-h-[70px] resize-none text-sm"
                aria-label="Additional context"
              />
            </div>
          </div>
        </div>

        {/* Fixed Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-background shrink-0 flex-row justify-between sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4 mr-1" />
                  Dismiss
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Skip these questions and keep the current statements</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {answeredCount} of {questionSet.questions.length} answered
            </span>
            <Button
              onClick={handleRegenerate}
              disabled={!hasAnyInput || isRegenerating}
              className="gap-2"
            >
              {isRegenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Regenerate with Details
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Indicator button/badge to show clarifying questions status
 * Shows different states:
 * - Has questions (amber, pulsing) - click to open modal
 * - No questions (green checkmark) - statement is complete
 */
interface ClarifyingQuestionsIndicatorProps {
  mpaKey: string;
  rateeId: string;
  /** Whether generation has completed for this MPA */
  hasGenerated?: boolean;
  className?: string;
}

export function ClarifyingQuestionsIndicator({
  mpaKey,
  rateeId,
  hasGenerated = false,
  className,
}: ClarifyingQuestionsIndicatorProps) {
  const { getQuestionsForMPA, openModal } = useClarifyingQuestionsStore();

  const questionSet = getQuestionsForMPA(mpaKey, rateeId);
  const questionCount = questionSet?.questions.length || 0;
  const hasQuestions = questionCount > 0;

  // If no questions and hasn't generated, don't show anything
  if (!hasQuestions && !hasGenerated) {
    return null;
  }

  // Show "no questions" badge when generated but no questions
  if (!hasQuestions && hasGenerated) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn(
              "gap-1 text-xs h-6 px-2 cursor-default",
              "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
              className
            )}
          >
            <CheckCircle2 className="h-3 w-3" />
            Complete
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>No clarifying questions needed</p>
          <p className="text-xs text-muted-foreground">
            The AI had enough context to generate your statement
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Has questions - show indicator button
  const isNew = !questionSet?.hasBeenViewed;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "relative h-7 gap-1.5 px-2",
            isNew && "animate-pulse",
            "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600",
            className
          )}
          onClick={() => questionSet && openModal(questionSet.id)}
        >
          <Lightbulb className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">
            {questionCount} question{questionCount > 1 ? "s" : ""}
          </span>
          {isNew && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500 border border-background" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">Enhance your statement</p>
        <p className="text-xs text-muted-foreground">
          Answer {questionCount} question{questionCount > 1 ? "s" : ""} to add more impact
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
