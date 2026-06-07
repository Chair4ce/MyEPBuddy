"use client";

import { useState } from "react";
import { useUserStore } from "@/stores/user-store";
import { createClient } from "@/lib/supabase/client";
import {
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ShieldAlert, FlaskConical } from "lucide-react";
import { getTermsSessionKey } from "@/lib/terms-session";

const PROHIBITED_ITEMS = [
  {
    label: "Classified",
    detail: "Confidential, Secret, Top Secret, SCI, SAP",
  },
  {
    label: "CUI",
    detail: "Controlled Unclassified Information (32 CFR 2002)",
  },
  { label: "FOUO", detail: "For Official Use Only" },
  {
    label: "PII",
    detail: "SSNs, DOB, addresses, phone numbers, biometrics",
  },
  { label: "PHI", detail: "Medical records, health info (HIPAA)" },
  {
    label: "OPSEC",
    detail: "Operations, force movements, TTPs, unit capabilities",
  },
  { label: "Export Controlled", detail: "ITAR, EAR restricted data" },
  {
    label: "LES / Proprietary",
    detail: "Law enforcement sensitive or trade secret data",
  },
] as const;

const OPSEC_ITEMS = [
  "Use general descriptions instead of specific unit names, locations, or mission details",
  "Avoid details that could identify individuals or reveal sensitive capabilities",
  "Statements shared to the community are visible to all users — review before sharing",
  "Data entered is stored in third-party cloud infrastructure — treat all input as publicly accessible",
] as const;

interface TermsStepProps {
  userId: string;
}

export function TermsStep({ userId }: TermsStepProps) {
  const [isChecked, setIsChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setProfile, profile, setTermsAcceptedThisSession } = useUserStore();

  async function handleAcceptTerms() {
    if (!isChecked) {
      toast.error(
        "Please acknowledge the data handling requirements to continue."
      );
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

      if (error) throw error;

      if (profile) {
        setProfile({ ...profile, terms_accepted_at: acceptedAt });
      }

      setTermsAcceptedThisSession(true);

      try {
        sessionStorage.setItem(getTermsSessionKey(userId), "true");
      } catch {
        // sessionStorage may be unavailable
      }

      toast.success(
        "Thank you for acknowledging the data handling requirements."
      );
    } catch (error) {
      console.error("Failed to accept terms:", error);
      toast.error("Failed to save your acknowledgment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex w-[min(100vw-1.5rem,48rem)] max-w-full flex-col max-h-[min(85dvh,52rem)]">
      <div className="shrink-0 border-b p-4 md:p-6 md:pb-4">
        <AlertDialogHeader className="space-y-2">
          <div className="mx-auto flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert
              className="h-5 w-5 md:h-6 md:w-6 text-destructive"
              aria-hidden="true"
            />
          </div>
          <AlertDialogTitle className="text-center text-base md:text-lg font-semibold">
            Data Handling &amp; OPSEC Notice
          </AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            Please read and acknowledge the data handling requirements before
            continuing.
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4 md:p-6 md:pt-4">
          <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 md:p-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <FlaskConical
                className="size-4 text-amber-600 shrink-0"
                aria-hidden="true"
              />
              <p className="font-semibold text-amber-800 dark:text-amber-400 text-sm">
                Prototype Application
              </p>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-300/80">
              This application is a prototype intended to validate features only.
              It is not an official DoD or DAF system. Data entered may be used
              for feature development and testing purposes.
            </p>
          </div>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 md:p-4 space-y-2">
            <p className="font-semibold text-destructive text-sm">
              DO NOT submit any protected information:
            </p>
            <ul className="grid gap-2 text-sm md:grid-cols-2 md:gap-x-6">
              {PROHIBITED_ITEMS.map((item) => (
                <li
                  key={item.label}
                  className="flex gap-2 text-muted-foreground"
                >
                  <span className="text-destructive shrink-0 mt-0.5">•</span>
                  <div>
                    <span className="font-medium text-foreground">
                      {item.label}
                    </span>{" "}
                    — {item.detail}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border bg-muted/50 p-3 md:p-4 space-y-2">
            <p className="font-semibold text-foreground text-sm">
              Practice Good OPSEC
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground md:grid md:grid-cols-2 md:gap-x-6">
              {OPSEC_ITEMS.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              All data must be UNCLASSIFIED and publicly releasable.
            </span>{" "}
            This application is not authorized for processing protected
            information. Violations may result in account suspension and
            reporting to your chain of command.
          </p>
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-t bg-muted/30 p-4 md:p-6">
        <label
          htmlFor="terms-checkbox"
          className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/50 md:max-w-2xl md:mx-auto"
        >
          <Checkbox
            id="terms-checkbox"
            checked={isChecked}
            onCheckedChange={(checked) => setIsChecked(checked === true)}
            className="mt-0.5 shrink-0"
          />
          <span className="text-sm font-medium leading-relaxed">
            I acknowledge that I will not submit any protected information. All
            data I enter will be UNCLASSIFIED and I will practice good OPSEC.
          </span>
        </label>

        <AlertDialogFooter className="p-0 md:justify-center">
          <Button
            onClick={() => void handleAcceptTerms()}
            disabled={!isChecked || isSubmitting}
            className="w-full md:w-auto md:min-w-[220px]"
            size="default"
          >
            {isSubmitting ? "Saving..." : "I Understand & Agree"}
          </Button>
        </AlertDialogFooter>
      </div>
    </div>
  );
}
