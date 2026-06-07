"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useCreditsStore } from "@/stores/credits-store";
import { clearAllTermsSessionFlags } from "@/lib/terms-session";
import { ACCOUNT_EXIT_REASONS } from "@/lib/account-deletion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { AlertTriangle, Heart, Loader2, Trash2 } from "lucide-react";

type DialogStep = "survey" | "confirm";

interface DeleteAccountSectionProps {
  userEmail: string | null;
}

export function DeleteAccountSection({ userEmail }: DeleteAccountSectionProps) {
  const router = useRouter();
  const supabase = createClient();
  const profile = useUserStore((state) => state.profile);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>("survey");
  const [reason, setReason] = useState<string>("");
  const [comments, setComments] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmationHint = userEmail
    ? userEmail
    : 'Type "DELETE" to confirm';

  function resetDialog() {
    setStep("survey");
    setReason("");
    setComments("");
    setConfirmation("");
    setIsDeleting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isDeleting) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      resetDialog();
    }
  }

  async function handleDeleteAccount() {
    if (!profile?.id) return;

    const expectedEmail = (userEmail || profile.email || "").trim().toLowerCase();
    const normalizedConfirmation = confirmation.trim().toLowerCase();
    const isPhoneOnly = expectedEmail.length === 0;

    const isValidConfirmation =
      (!isPhoneOnly && normalizedConfirmation === expectedEmail) ||
      (isPhoneOnly && confirmation.trim().toUpperCase() === "DELETE");

    if (!isValidConfirmation) {
      toast.error(
        isPhoneOnly
          ? 'Type "DELETE" to confirm account deletion.'
          : "Confirmation must match your account email exactly.",
      );
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: confirmation.trim(),
          reason: reason || null,
          comments: comments.trim() || null,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          typeof result.error === "string"
            ? result.error
            : "Failed to delete account. Please try again.";
        throw new Error(message);
      }

      await supabase.auth.signOut().catch(() => undefined);
      clearAllTermsSessionFlags();
      useUserStore.getState().reset();
      useCreditsStore.getState().reset();

      const surveyToken =
        typeof result.surveyToken === "string" ? result.surveyToken : null;
      const redirectUrl = surveyToken
        ? `/account-deleted?survey=${encodeURIComponent(surveyToken)}`
        : "/account-deleted";

      router.push(redirectUrl);
      router.refresh();
    } catch (error) {
      console.error("Account deletion failed:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete account. Please try again.",
      );
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="size-5" />
            Delete Account
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>EPBs, OPBs, awards, decorations, and accomplishments</li>
            <li>Team relationships and managed members you created</li>
            <li>API keys, settings, credits, and billing history</li>
            <li>Profile, avatar, and sign-in credentials</li>
          </ul>
          <Button
            variant="destructive"
            onClick={() => setOpen(true)}
            aria-label="Delete my account"
          >
            <Trash2 className="size-4 mr-2" />
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg" aria-describedby="delete-account-description">
          {step === "survey" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Heart className="size-5 text-primary" />
                  Sorry to see you go
                </DialogTitle>
                <DialogDescription id="delete-account-description">
                  Before you leave, would you mind sharing why? Your feedback
                  helps us improve MyEPBuddy for everyone still serving.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="exit-reason">Reason for leaving (optional)</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger id="exit-reason" aria-label="Reason for leaving">
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
                  <Label htmlFor="exit-comments">Additional feedback (optional)</Label>
                  <Textarea
                    id="exit-comments"
                    aria-label="Additional feedback"
                    placeholder="What could we have done better?"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    className="resize-none"
                  />
                  {comments.length > 0 && (
                    <p className="text-xs text-muted-foreground text-right">
                      {comments.length}/2,000
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep("confirm")}
                  className="text-muted-foreground"
                >
                  Skip
                </Button>
                <Button type="button" onClick={() => setStep("confirm")}>
                  Continue
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-destructive">
                  Confirm account deletion
                </DialogTitle>
                <DialogDescription id="delete-account-description">
                  This permanently deletes your account and all data. You will
                  be signed out immediately and cannot recover your information.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-2">You will lose:</p>
                  <ul className="space-y-1 list-disc pl-5">
                    <li>All performance documents and entries</li>
                    <li>Team links and supervision history</li>
                    <li>Remaining credits and purchase history</li>
                    <li>Your profile and sign-in access</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delete-confirmation">
                    {userEmail
                      ? `Type your email to confirm: ${userEmail}`
                      : 'Type "DELETE" to confirm'}
                  </Label>
                  <Input
                    id="delete-confirmation"
                    aria-label="Confirm account deletion"
                    placeholder={confirmationHint}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                    disabled={isDeleting}
                  />
                </div>
              </div>

              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("survey")}
                  disabled={isDeleting}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || !confirmation.trim()}
                  aria-label="Permanently delete my account"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Deleting account...
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4 mr-2" />
                      Permanently delete account
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
