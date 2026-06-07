"use client";

import { useState } from "react";
import { ACCOUNT_EXIT_REASONS } from "@/lib/account-deletion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { CheckCircle2, Heart, Loader2, Send } from "lucide-react";

interface AccountDeletedSurveyProps {
  surveyToken: string | null;
}

export function AccountDeletedSurvey({ surveyToken }: AccountDeletedSurveyProps) {
  const [reason, setReason] = useState("");
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!surveyToken) {
    return null;
  }

  async function handleSubmit() {
    if (!reason && !comments.trim()) {
      toast.error("Please select a reason or share a comment.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/account/exit-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: surveyToken,
          reason: reason || null,
          comments: comments.trim() || null,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          typeof result.error === "string"
            ? result.error
            : "Failed to submit feedback.";
        throw new Error(message);
      }

      setIsSubmitted(true);
      toast.success("Thank you for your feedback!");
    } catch (error) {
      console.error("Exit survey submission failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to submit feedback.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
        <CheckCircle2 className="size-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
        <p className="text-muted-foreground">
          Thank you for taking a moment to share your thoughts. We wish you the
          best in your career.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium flex items-center gap-2">
          <Heart className="size-4 text-primary" />
          One quick question? (optional)
        </p>
        <p className="text-xs text-muted-foreground">
          Your account is already deleted. This feedback is anonymous and helps
          us improve for those still serving.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="goodbye-reason">Why did you leave?</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger id="goodbye-reason" aria-label="Reason for leaving">
            <SelectValue placeholder="Select a reason (optional)" />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_EXIT_REASONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="goodbye-comments">Anything else? (optional)</Label>
        <Textarea
          id="goodbye-comments"
          aria-label="Additional feedback"
          placeholder="What could we have done better?"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={3}
          maxLength={2000}
          className="resize-none"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">You can close this page anytime.</p>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting || (!reason && !comments.trim())}
          aria-label="Submit exit survey"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Sending...
            </>
          ) : (
            <>
              <Send className="size-4 mr-2" />
              Share feedback
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
