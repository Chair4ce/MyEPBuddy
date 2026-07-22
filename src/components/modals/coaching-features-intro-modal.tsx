"use client";

import { useState } from "react";
import {
  BarChart3,
  ClipboardCheck,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CoachingFeaturesIntroModalProps {
  open: boolean;
  onDismiss: () => void;
}

const SLIDES = [
  {
    icon: BarChart3,
    title: "Cycle quality insights",
    body: "Track MPA coverage and quality signals (metrics, impact, miscategorization risk) across the evaluation period — not just entry counts.",
    howTo: [
      "Open Accomplishments from the sidebar.",
      "Find the Performance Coverage card for yourself or a selected ratee.",
    ],
  },
  {
    icon: ClipboardCheck,
    title: "Assess entries & guidance notes",
    body: "Score an entry against the ACA rubric. Weak indicators become concrete improvement notes — useful for self-edits or feedback to a ratee.",
    howTo: [
      "Open Accomplishments → Add Entry or edit an existing one.",
      "Use Assess entry (enlisted ACA packages).",
    ],
  },
  {
    icon: MessageSquareText,
    title: "Expectations & Feedback session guides",
    body: "Private ACA prep for Initial, Midterm, and Final. Initial: format your session guide. Midterm: strengths & weaknesses → Generate. Final: EPB package → Generate. Share the guide only for in-app ratees — settings stay private.",
    howTo: [
      "Go to Team in the sidebar.",
      "Open a direct report (⋯ menu on their card, or their detail actions).",
      "Choose Expectations & Feedback (Beta).",
      "Use the Initial → Midterm → EPB → Final steps across the top.",
    ],
  },
] as const;

export function CoachingFeaturesIntroModal({
  open,
  onDismiss,
}: CoachingFeaturesIntroModalProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const slide = SLIDES[slideIndex];
  const SlideIcon = slide.icon;
  const isFirstSlide = slideIndex === 0;
  const isLastSlide = slideIndex === SLIDES.length - 1;

  function dismissAndReset() {
    setSlideIndex(0);
    onDismiss();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      dismissAndReset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="auto"
        className="box-border w-[min(100vw-1.5rem,32rem)] max-w-full gap-0 overflow-hidden p-0"
      >
        <div className="box-border max-h-[min(90dvh,640px)] overflow-y-auto p-6 md:p-8">
          <DialogHeader className="space-y-3 text-center sm:text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <Sparkles
                className="h-5 w-5 shrink-0 text-primary"
                aria-hidden
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <DialogTitle className="text-base md:text-lg">
                Coaching tools for stronger EPBs
              </DialogTitle>
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[10px] font-medium uppercase tracking-wide"
              >
                Beta
              </Badge>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              Early-access coaching features for building your own package or
              helping a ratee. Paths below show exactly where to open each tool.
            </DialogDescription>
          </DialogHeader>

          <div key={slideIndex} className="mt-5 space-y-3">
            <div className="rounded-lg border p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_0_0_0.5px_rgba(0,0,0,0.08)]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <SlideIcon
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 space-y-2 text-left">
                  <h3 className="text-sm font-medium text-foreground">
                    {slide.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {slide.body}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-md bg-muted/50 px-3 py-2.5 text-left">
                <p className="text-xs font-medium text-foreground">
                  How to get there
                </p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                  {slide.howTo.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          <div
            className="mt-5 flex items-center justify-center gap-2"
            role="tablist"
            aria-label="Coaching features introduction slides"
          >
            {SLIDES.map((_, index) => (
              <span
                key={index}
                role="tab"
                aria-selected={index === slideIndex}
                aria-label={`Slide ${index + 1} of ${SLIDES.length}`}
                className={cn(
                  "h-2 w-2 rounded-full transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  index === slideIndex
                    ? "bg-primary"
                    : "bg-muted-foreground/30",
                )}
              />
            ))}
          </div>

          <DialogFooter className="mt-5 flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="order-3 w-full active:scale-[0.98] sm:order-1 sm:w-auto"
              onClick={dismissAndReset}
              aria-label="Skip coaching features introduction"
            >
              Skip
            </Button>
            <div className="order-1 flex w-full flex-col gap-2 sm:order-2 sm:w-auto sm:flex-row">
              {!isFirstSlide && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full active:scale-[0.98] sm:w-auto"
                  onClick={() => setSlideIndex((current) => current - 1)}
                >
                  Back
                </Button>
              )}
              {isLastSlide ? (
                <Button
                  type="button"
                  className="w-full active:scale-[0.98] sm:min-w-[160px] sm:w-auto"
                  onClick={dismissAndReset}
                  aria-label="Dismiss coaching features introduction"
                >
                  Got it
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full active:scale-[0.98] sm:min-w-[160px] sm:w-auto"
                  onClick={() => setSlideIndex((current) => current + 1)}
                >
                  Next
                </Button>
              )}
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
