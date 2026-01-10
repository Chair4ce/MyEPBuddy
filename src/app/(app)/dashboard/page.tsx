"use client";

import { useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useAccomplishmentsStore } from "@/stores/accomplishments-store";
import { Button } from "@/components/ui/button";
import type { Accomplishment } from "@/types/database";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import {
  Users,
  Sparkles,
  Plus,
  TrendingUp,
} from "lucide-react";
import { SUPERVISOR_RANKS, getStaticCloseoutDate, getActiveCycleYear, isOfficer } from "@/lib/constants";
import { PendingLinksCard } from "@/components/dashboard/pending-links-card";
import { PendingPriorDataCard } from "@/components/dashboard/pending-prior-data-card";
import { TeamAccomplishmentsFeed } from "@/components/dashboard/team-accomplishments-feed";
import type { Rank } from "@/types/database";

export default function DashboardPage() {
  const { profile, subordinates, epbConfig } = useUserStore();
  const { setAccomplishments, isLoading, setIsLoading } =
    useAccomplishmentsStore();

  const supabase = createClient();
  
  // Cycle year and SCOD are computed from the user's rank
  const userRank = profile?.rank as Rank | null;
  const scodInfo = getStaticCloseoutDate(userRank);
  const cycleYear = getActiveCycleYear(userRank);

  // Check if user is a supervisor rank
  const isSupervisorRank =
    profile?.rank && SUPERVISOR_RANKS.includes(profile.rank as Rank);
  
  // Check if user is an officer (officers don't have EPBs for themselves)
  const userIsOfficer = isOfficer(profile?.rank ?? null);

  useEffect(() => {
    async function loadAccomplishments() {
      if (!profile) return;

      setIsLoading(true);

      const { data, error } = await supabase
        .from("accomplishments")
        .select("*")
        .eq("user_id", profile.id)
        .eq("cycle_year", cycleYear)
        .order("date", { ascending: false });

      if (!error && data) {
        const typedData = data as unknown as Accomplishment[];
        setAccomplishments(typedData);
      }

      setIsLoading(false);
    }

    loadAccomplishments();
  }, [profile, cycleYear, supabase, setAccomplishments, setIsLoading]);

  if (isLoading) {
    return <PageSpinner />;
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {profile?.rank} {profile?.full_name?.split(" ")[0] || (userIsOfficer ? "Sir/Ma'am" : "Airman")}
        </h1>
        <p className="text-muted-foreground">
          {userIsOfficer 
            ? `${cycleYear} Cycle${scodInfo ? ` • OPR SCOD: ${scodInfo.label}` : " • Team Management Mode"}`
            : `${cycleYear} EPB Cycle${scodInfo ? ` • SCOD: ${scodInfo.label}` : ""}`
          }
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {!userIsOfficer && (
          <Button asChild>
            <Link href="/entries?new=true">
              <Plus className="size-4 mr-2" />
              New Entry
            </Link>
          </Button>
        )}
        {!userIsOfficer ? (
          <Button variant="outline" asChild>
            <Link href="/generate">
              <Sparkles className="size-4 mr-2" />
              Generate EPB
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/team">
              <Users className="size-4 mr-2" />
              Manage Team
            </Link>
          </Button>
        )}
        {!userIsOfficer && (subordinates.length > 0 || profile?.role === "admin") && (
          <Button variant="outline" asChild>
            <Link href="/team">
              <Users className="size-4 mr-2" />
              View Team
            </Link>
          </Button>
        )}
      </div>

      {/* Officer Info Card */}
      {userIsOfficer && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="size-5 text-blue-600 dark:text-blue-400" />
              Officer Team Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              As an officer, your primary features focus on supporting your enlisted team members:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Generate and manage EPBs for enlisted subordinates</li>
              <li>Review and comment on team member entries</li>
              <li>Track your team&apos;s performance progress</li>
              <li>Create award packages for your Airmen</li>
            </ul>
            <p className="text-xs text-muted-foreground italic">
              OPB (Officer Performance Brief) features are coming in a future update.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pending Account Links */}
      <PendingLinksCard />

      {/* Pending Prior Data Reviews */}
      <PendingPriorDataCard />

      {/* Team Activity Feed - For Supervisors */}
      {isSupervisorRank && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" />
              Team Activity Feed
            </CardTitle>
            <CardDescription>
              Recent accomplishments from your subordinates and their teams
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TeamAccomplishmentsFeed cycleYear={cycleYear} />
          </CardContent>
        </Card>
      )}

      {/* Team Summary - For civilians or supervisors with subordinates */}
      {profile?.rank === "Civilian" && subordinates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Team Overview
            </CardTitle>
            <CardDescription>
              Quick view of your team&apos;s performance tracking status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border bg-muted/50 text-center">
                <div className="text-3xl font-bold">{subordinates.length}</div>
                <p className="text-sm text-muted-foreground">Direct Reports</p>
              </div>
              <div className="p-4 rounded-lg border bg-muted/50 text-center">
                <div className="text-3xl font-bold">—</div>
                <p className="text-sm text-muted-foreground">Entries This Month</p>
              </div>
            </div>
            <div className="text-center pt-2">
              <Button variant="outline" asChild>
                <Link href="/team">
                  <Users className="size-4 mr-2" />
                  View Full Team Status
                </Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Civilian performance tracking coming soon. For now, use the Team page to manage your subordinates&apos; EPB progress.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

