"use client";

import Link from "next/link";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  EARN_REWARD_RULES,
  rewardTypeLabel,
  trackerEntryProgress,
  type CreditRewardType,
  type EarnRewardsSummary,
  type TokenRewardTrackerEntry,
} from "@/lib/billing/reward-constants";
import {
  ChevronDown,
  Gift,
  Phone,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

interface EarnedTokensTrackerProps {
  summary: EarnRewardsSummary | null;
  isLoading: boolean;
  className?: string;
}

function RuleList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-muted-foreground list-none pl-0">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="text-primary shrink-0 mt-0.5" aria-hidden>
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function repeatBadge(entry: TokenRewardTrackerEntry) {
  if (entry.repeat_mode === "once_per_user" || entry.repeat_mode === "once_per_source") {
    return (
      <Badge variant="secondary" className="font-normal shrink-0">
        One-time
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal shrink-0">
      Repeatable
    </Badge>
  );
}

function progressLabel(entry: TokenRewardTrackerEntry): string {
  const { count, cap, complete } = trackerEntryProgress(entry);
  if (entry.repeat_mode === "once_per_user" || entry.repeat_mode === "once_per_source") {
    return complete ? "Claimed" : "Not yet";
  }
  if (cap === null) return `${count} this year`;
  return `${count} / ${cap} this year`;
}

function TrackerEntryRow({ entry }: { entry: TokenRewardTrackerEntry }) {
  const { percent, complete } = trackerEntryProgress(entry);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2 text-sm">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{entry.public_label}</span>
            {repeatBadge(entry)}
            {!entry.enabled && (
              <Badge variant="outline" className="font-normal gap-1">
                <Clock className="size-3" aria-hidden />
                Coming soon
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{entry.rule_summary}</p>
        </div>
        <div className="text-right shrink-0 tabular-nums">
          <p className="font-medium text-emerald-600 dark:text-emerald-400">
            +{entry.amount}
          </p>
          <p className="text-xs text-muted-foreground">{progressLabel(entry)}</p>
        </div>
      </div>
      <Progress
        value={percent}
        className={cn("h-2", complete && "[&>[data-slot=progress-indicator]]:bg-emerald-500")}
        aria-label={`${entry.public_label} progress ${progressLabel(entry)}`}
      />
    </div>
  );
}

export function EarnedTokensTracker({
  summary,
  isLoading,
  className,
}: EarnedTokensTrackerProps) {
  const cycleYear = summary?.cycleYear ?? new Date().getFullYear();
  const maxBonus = EARN_REWARD_RULES.global.maxBonusPerCycle;
  const earnedCycle = summary?.totalBonusEarnedCycle ?? 0;
  const earnedAllTime = summary?.totalBonusEarned ?? 0;
  const phoneVerified = summary?.phoneVerified ?? false;
  const recentRewards = summary?.recentRewards ?? [];
  const trackerEntries = summary?.trackerEntries ?? [];
  const phoneRequiredEntries = trackerEntries.filter(
    (e) => e.requires_phone_verified,
  );

  return (
    <Card id="earn-tokens" className={cn("scroll-mt-6", className)}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Gift className="size-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="space-y-1 min-w-0">
            <CardTitle>Earn Tokens</CardTitle>
            <CardDescription>{EARN_REWARD_RULES.headline}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading ? (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground min-h-[80px]"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2 className="size-4 animate-spin" />
            Loading earn tracker...
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Earned in {cycleYear}
                </p>
                <p className="text-3xl font-bold tabular-nums">
                  {earnedCycle}
                  <span className="text-base font-normal text-muted-foreground ml-1">
                    tokens
                  </span>
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {earnedAllTime} all-time · cap {maxBonus}/year from promotions
                </p>
              </div>

              {phoneRequiredEntries.length > 0 && (
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Phone verification
                    </p>
                    {phoneVerified ? (
                      <Badge
                        variant="secondary"
                        className="gap-1 text-emerald-700 dark:text-emerald-400"
                      >
                        <CheckCircle2 className="size-3" aria-hidden />
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <AlertCircle className="size-3" aria-hidden />
                        Required for referrals
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {phoneVerified
                      ? "Your phone is verified for referral and supervision bonuses."
                      : "Referrals and supervision links require a unique verified phone."}
                  </p>
                  {!phoneVerified && (
                    <Button variant="outline" size="sm" asChild className="mt-1">
                      <Link
                        href="/settings#phone-verification"
                        aria-label="Verify phone in profile settings"
                      >
                        <Phone className="size-4 mr-2" />
                        Verify phone in Profile
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>

            {trackerEntries.length > 0 && (
              <div className="space-y-4" aria-label="Earn token actions">
                <p className="text-sm font-medium">Ways to earn</p>
                {trackerEntries.map((entry) => (
                  <TrackerEntryRow key={entry.reward_key} entry={entry} />
                ))}
              </div>
            )}

            {recentRewards.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Recent earn bonuses</p>
                <ul
                  className="divide-y rounded-lg border text-sm"
                  aria-label="Recent earn bonuses"
                >
                  {recentRewards.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <span className="text-muted-foreground min-w-0 truncate">
                        {row.description ||
                          rewardTypeLabel(row.reward_type as CreditRewardType)}
                      </span>
                      <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                        +{row.amount}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recentRewards.length === 0 && trackerEntries.some((e) => e.enabled) && (
              <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4">
                No earn bonuses yet. Add your first managed team member or complete
                another eligible action above to start earning.
              </p>
            )}
          </>
        )}

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between px-0 hover:bg-transparent"
              aria-label="Expand earn token rules"
            >
              <span className="font-medium">Full rules</span>
              <ChevronDown className="size-4 shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-5 pt-2">
            <p className="text-sm text-muted-foreground">
              {EARN_REWARD_RULES.phoneRequirement}
            </p>

            {trackerEntries.map((entry) => (
              <div key={`rules-${entry.reward_key}`} className="space-y-2">
                <h3 className="text-sm font-semibold flex flex-wrap items-center gap-2">
                  {entry.public_label}
                  {repeatBadge(entry)}
                </h3>
                <p className="text-sm text-muted-foreground">{entry.rule_summary}</p>
                {entry.rule_steps.length > 0 && (
                  <RuleList items={entry.rule_steps} />
                )}
                {!entry.enabled && (
                  <p className="text-xs text-muted-foreground italic">
                    Automatic payouts for this action are not live yet — rules shown
                    for reference.
                  </p>
                )}
              </div>
            ))}

            <p className="text-xs text-muted-foreground border-t pt-4">
              Repeatable referral and supervision payouts may take up to{" "}
              {EARN_REWARD_RULES.global.payoutDelayHours} hours after both people
              qualify. Maximum {EARN_REWARD_RULES.global.maxBonusPerCycle}{" "}
              promotional tokens per user per year.{" "}
              {EARN_REWARD_RULES.global.byokNote} Additional managed members after
              the first do not earn again.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
