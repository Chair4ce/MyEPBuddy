"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function FeedbackButton() {
  const { profile } = useUserStore();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Derive a feature tag from the current route (e.g. "/dashboard" → "dashboard")
  const feature = pathname?.replace(/^\//, "").split("/")[0] || "general";

  async function handleSubmit() {
    const trimmed = feedback.trim();
    if (!trimmed || !profile?.id) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/user-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          feature,
          feedback: trimmed,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        const message =
          typeof result.error === "string"
            ? result.error
            : "Failed to submit feedback. Please try again.";
        throw new Error(message);
      }

      toast.success("Thank you for your feedback!");
      setFeedback("");
      setIsSubmitted(true);

      setTimeout(() => {
        setOpen(false);
        setIsSubmitted(false);
      }, 3000);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to submit feedback. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full shadow-lg gap-2 bg-background hover:bg-accent"
            aria-label="Share feedback"
          >
            <MessageSquare className="size-4" />
            <span className="hidden sm:inline">Feedback</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-80 sm:w-96"
          sideOffset={8}
        >
          {isSubmitted ? (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 py-3">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>
                Thanks for sharing! Your feedback helps us build a better tool.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Share Your Feedback</p>
                <p className="text-xs text-muted-foreground">
                  Tell us what&apos;s working, what&apos;s not, or what
                  you&apos;d like to see next.
                </p>
              </div>
              <Textarea
                id="global-feedback"
                aria-label="Your feedback"
                placeholder="e.g., I wish this page showed..., It would be great if..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                className="resize-none"
                maxLength={2000}
                disabled={isSubmitting}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {feedback.length > 0 && `${feedback.length}/2,000`}
                </p>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !feedback.trim()}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="size-4 mr-2" />
                      Submit
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
