"use client";

import { useRouter } from "next/navigation";
import { useUsageLimitStore } from "@/stores/usage-limit-store";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Key, Clock, ArrowRight } from "lucide-react";

function formatResetDate(iso: string | null): string {
  if (!iso) return "next Monday";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function UsageLimitDialog() {
  const router = useRouter();
  const { isOpen, weeklyUsed, weeklyLimit, resetDate, closeDialog } =
    useUsageLimitStore();

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent className="max-w-md" onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-amber-500 shrink-0" />
            Weekly AI Limit Reached
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-1">
              <p>
                You&apos;ve used all{" "}
                <span className="font-semibold text-foreground">
                  {weeklyUsed}/{weeklyLimit}
                </span>{" "}
                free AI actions for this week.
              </p>

              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Key className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">
                      Add your own API key for unlimited access
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Bring your own key from OpenAI, Google, Anthropic, or xAI.
                      You only pay for what you use — most actions cost less
                      than $0.01.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">
                      Or wait for your limit to reset
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Resets {formatResetDate(resetDate)}.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={closeDialog}
          >
            I&apos;ll wait
          </Button>
          <Button
            className="w-full sm:w-auto gap-2"
            onClick={() => {
              closeDialog();
              router.push("/settings/api-keys");
            }}
          >
            Add API Key
            <ArrowRight className="h-4 w-4" />
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
