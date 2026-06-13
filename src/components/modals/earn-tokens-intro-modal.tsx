"use client";

import Link from "next/link";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EARN_REWARD_RULES, FALLBACK_TRACKER_ENTRIES } from "@/lib/billing/reward-constants";
import type { TokenRewardTrackerEntry } from "@/lib/billing/reward-constants";
import {
  Gift,
  Phone,
  UserPlus,
  Users,
  UserCog,
  Clock,
} from "lucide-react";

interface EarnTokensIntroModalProps {
  open: boolean;
  hasOwnKey: boolean;
  trackerEntries: TokenRewardTrackerEntry[];
  onDismiss: () => void;
}

function entryIcon(rewardKey: string) {
  switch (rewardKey) {
    case "first_managed_member":
      return UserCog;
    case "referral_referrer":
    case "referral_referee":
      return UserPlus;
    case "supervision_requester":
    case "supervision_accepter":
      return Users;
    default:
      return Gift;
  }
}

export function EarnTokensIntroModal({
  open,
  hasOwnKey,
  trackerEntries,
  onDismiss,
}: EarnTokensIntroModalProps) {
  const entries = (
    trackerEntries.length > 0 ? trackerEntries : FALLBACK_TRACKER_ENTRIES
  )
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        priority="high"
        size="auto"
        className="block w-fit max-w-[min(100vw-1.5rem,100%)] gap-0 overflow-hidden p-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div className="box-border w-[min(100vw-1.5rem,32rem)] max-w-full p-6 md:p-8 max-h-[min(90dvh,640px)] overflow-y-auto">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10">
              <Gift
                className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0"
                aria-hidden
              />
            </div>
            <AlertDialogTitle className="text-center text-base md:text-lg">
              New ways to earn AI tokens
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-1 text-sm text-left">
                {hasOwnKey ? (
                  <p className="text-muted-foreground text-center">
                    You use your own API key for unlimited AI usage. Teammates on
                    free app tokens can earn bonuses through the actions below.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-center">
                    Grow your team and earn free tokens on top of your trial and
                    purchases. Track progress anytime under{" "}
                    <span className="text-foreground font-medium">
                      Settings → AI Tokens
                    </span>
                    .
                  </p>
                )}

                <ul className="space-y-3 list-none pl-0" aria-label="Ways to earn tokens">
                  {entries.map((entry) => {
                    const Icon = entryIcon(entry.reward_key);
                    const oneTime =
                      entry.repeat_mode === "once_per_user" ||
                      entry.repeat_mode === "once_per_source";

                    return (
                      <li
                        key={entry.reward_key}
                        className="rounded-lg border p-3 space-y-1.5"
                      >
                        <div className="flex items-start gap-3">
                          <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className="size-4 text-muted-foreground" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-foreground">
                                {entry.public_label}
                              </span>
                              <span className="tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                                +{entry.amount}
                              </span>
                              {oneTime ? (
                                <Badge variant="secondary" className="font-normal text-xs">
                                  One-time
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="font-normal text-xs">
                                  Repeatable
                                </Badge>
                              )}
                              {!entry.enabled && (
                                <Badge variant="outline" className="font-normal text-xs gap-1">
                                  <Clock className="size-3" aria-hidden />
                                  Coming soon
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {entry.rule_summary}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="rounded-lg bg-muted/50 p-3 flex gap-2 text-xs text-muted-foreground">
                  <Phone className="size-4 shrink-0 mt-0.5" aria-hidden />
                  <p>{EARN_REWARD_RULES.phoneRequirement}</p>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Max {EARN_REWARD_RULES.global.maxBonusPerCycle} promotional tokens
                  per year. {EARN_REWARD_RULES.global.byokNote}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-5 flex-col sm:flex-row gap-2 sm:justify-center">
            {!hasOwnKey && (
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/settings/billing#earn-tokens" onClick={onDismiss}>
                  View earn tracker
                </Link>
              </Button>
            )}
            <Button
              onClick={onDismiss}
              className="w-full sm:w-auto sm:min-w-[160px]"
              aria-label="Dismiss earn tokens introduction"
            >
              Got it
            </Button>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
