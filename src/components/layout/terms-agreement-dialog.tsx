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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

interface TermsAgreementDialogProps {
  open: boolean;
  userId: string;
}

export function TermsAgreementDialog({ open, userId }: TermsAgreementDialogProps) {
  const [isChecked, setIsChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setProfile, profile } = useUserStore();

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
              Important Data Handling Notice
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Please read and acknowledge the data handling requirements before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6 space-y-4">
            <p className="font-medium text-foreground text-xs sm:text-sm">
              Before you continue, please read and acknowledge the following:
            </p>
            
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <p className="font-semibold text-destructive text-xs sm:text-sm">
                ⚠️ DO NOT submit any protected information:
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
                  <div><span className="font-medium text-foreground">OPSEC</span> — Operations, force movements, TTPs</div>
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">Export Controlled</span> — ITAR, EAR restricted data</div>
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">LES</span> — Law Enforcement Sensitive info</div>
                </li>
                <li className="flex gap-2 text-muted-foreground">
                  <span className="text-destructive flex-shrink-0 mt-0.5">•</span>
                  <div><span className="font-medium text-foreground">Proprietary</span> — Trade secrets, contractor data</div>
                </li>
              </ul>
            </div>

            <div className="space-y-2 text-xs sm:text-sm">
              <p>
                <span className="font-semibold text-foreground">All data must be UNCLASSIFIED and publicly releasable.</span>{" "}
                This application is not authorized for processing protected information.
              </p>
              <p className="text-muted-foreground">
                Use general descriptions. Avoid details that could identify individuals or compromise security.
              </p>
            </div>
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
              I acknowledge that I will not submit any protected information. All data I enter will be UNCLASSIFIED.
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

