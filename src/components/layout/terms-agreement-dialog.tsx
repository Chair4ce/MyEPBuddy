"use client";

import { useState } from "react";
import { useUserStore } from "@/stores/user-store";
import { createClient } from "@/lib/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ShieldAlert, FlaskConical } from "lucide-react";

const SESSION_TERMS_KEY = "epb_terms_accepted_session";

interface TermsAgreementDialogProps {
  open: boolean;
  userId: string;
}

export function TermsAgreementDialog({ open, userId }: TermsAgreementDialogProps) {
  const [isChecked, setIsChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setProfile, profile, setTermsAcceptedThisSession } = useUserStore();

  const handleAcceptTerms = async () => {
    if (!isChecked) {
      toast.error("Please acknowledge the data handling requirements to continue.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const acceptedAt = new Date().toISOString();

      const { error } = await supabase
        .from("profiles")
        .update({ terms_accepted_at: acceptedAt } as never)
        .eq("id", userId);

      if (error) {
        throw error;
      }

      // Update the local profile state
      if (profile) {
        setProfile({ ...profile, terms_accepted_at: acceptedAt });
      }

      // Mark as accepted for this session (persists in zustand store, resets on page refresh/new tab)
      setTermsAcceptedThisSession(true);

      // Also persist in sessionStorage (survives in-page navigation but not tab close)
      try {
        sessionStorage.setItem(SESSION_TERMS_KEY, "true");
      } catch {
        // sessionStorage may not be available in some environments
      }

      toast.success("Thank you for acknowledging the data handling requirements.");
    } catch (error) {
      console.error("Failed to accept terms:", error);
      toast.error("Failed to save your acknowledgment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[85dvh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Fixed Header */}
        <div className="flex-shrink-0 p-4 sm:p-6 pb-2 sm:pb-3 border-b">
          <AlertDialogHeader className="space-y-2">
            <div className="mx-auto flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6 text-destructive" aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-center text-base sm:text-lg font-semibold">
              Data Handling &amp; OPSEC Notice
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Please read and acknowledge the data handling requirements before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6 space-y-4">
            {/* Prototype Disclaimer */}
            <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <FlaskConical className="size-4 text-amber-600 shrink-0" aria-hidden="true" />
                <p className="font-semibold text-amber-800 dark:text-amber-400 text-xs sm:text-sm">
                  Prototype Application
                </p>
              </div>
              <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300/80">
                This application is a prototype intended to validate features only. It is not an official DoD or DAF system. Data entered may be used for feature development and testing purposes.
              </p>
            </div>

            {/* Data Handling */}
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <p className="font-semibold text-destructive text-xs sm:text-sm">
                DO NOT submit any protected information:
              </p>
              <ul className="space-y-1.5 text-xs sm:text-sm">
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">Classified</span> — Confidential, Secret, Top Secret, SCI, SAP</div>
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">CUI</span> — Controlled Unclassified Information (32 CFR 2002)</div>
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">FOUO</span> — For Official Use Only</div>
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">PII</span> — SSNs, DOB, addresses, phone numbers, biometrics</div>
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">PHI</span> — Medical records, health info (HIPAA)</div>
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">OPSEC</span> — Operations, force movements, TTPs, unit capabilities</div>
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">Export Controlled</span> — ITAR, EAR restricted data</div>
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">LES / Proprietary</span> — Law enforcement sensitive or trade secret data</div>
                </li>
              </ul>
            </div>

            {/* OPSEC Practices */}
            <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
              <p className="font-semibold text-foreground text-xs sm:text-sm">
                Practice Good OPSEC
              </p>
              <ul className="space-y-1 text-xs sm:text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>Use <span className="font-medium text-foreground">general descriptions</span> instead of specific unit names, locations, or mission details</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>Avoid details that could <span className="font-medium text-foreground">identify individuals</span> or reveal sensitive capabilities</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>Statements shared to the <span className="font-medium text-foreground">community are visible to all users</span> — review before sharing</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>Data entered is stored in third-party cloud infrastructure — <span className="font-medium text-foreground">treat all input as publicly accessible</span></span>
                </li>
              </ul>
            </div>

            <p className="text-xs sm:text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">All data must be UNCLASSIFIED and publicly releasable.</span>{" "}
              This application is not authorized for processing protected information. Violations may result in account suspension and reporting to your chain of command.
            </p>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="flex-shrink-0 border-t bg-muted/30 p-4 sm:p-6 space-y-3">
          <label
            htmlFor="terms-checkbox"
            className="flex items-start gap-3 rounded-lg border bg-background p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <Checkbox
              id="terms-checkbox"
              checked={isChecked}
              onCheckedChange={(checked) => setIsChecked(checked === true)}
              className="mt-0.5 flex-shrink-0"
            />
            <span className="text-xs sm:text-sm font-medium leading-relaxed">
              I acknowledge that I will not submit any protected information. All data I enter will be UNCLASSIFIED and I will practice good OPSEC.
            </span>
          </label>

          <AlertDialogFooter className="p-0 sm:justify-center">
            <Button
              onClick={handleAcceptTerms}
              disabled={!isChecked || isSubmitting}
              className="w-full"
              size="default"
            >
              {isSubmitting ? "Saving..." : "I Understand & Agree"}
            </Button>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

