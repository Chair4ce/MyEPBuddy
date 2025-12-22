"use client";

import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Users,
  Sparkles,
  Calendar,
  Target,
  Plus,
} from "lucide-react";
import { ENTRY_MGAS } from "@/lib/constants";
import { PendingLinksCard } from "@/components/dashboard/pending-links-card";
import { PendingPriorDataCard } from "@/components/dashboard/pending-prior-data-card";
import { EPBProgressCard } from "@/components/epb/epb-progress-card";
import type { Rank } from "@/types/database";

export default function DashboardPage() {
  const { profile, subordinates, epbConfig } = useUserStore();
  const { accomplishments, setAccomplishments, isLoading, setIsLoading } =
    useAccomplishmentsStore();
  const [stats, setStats] = useState({
    totalEntries: 0,
    thisMonth: 0,
    byMPA: {} as Record<string, number>,
  });

  const supabase = createClient();
  const cycleYear = epbConfig?.current_cycle_year || new Date().getFullYear();

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

        // Calculate stats
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const thisMonth = typedData.filter(
          (a) => new Date(a.date) >= monthStart
        ).length;

        const byMPA = typedData.reduce((acc, a) => {
          acc[a.mpa] = (acc[a.mpa] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        setStats({
          totalEntries: typedData.length,
          thisMonth,
          byMPA,
        });
      }

      setIsLoading(false);
    }

    loadAccomplishments();
  }, [profile, cycleYear, supabase, setAccomplishments, setIsLoading]);

  // Use entry MPAs for tracking (excludes HLR which is Commander's assessment)
  const mgas = ENTRY_MGAS;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {profile?.rank} {profile?.full_name?.split(" ")[0] || "Airman"}
        </h1>
        <p className="text-muted-foreground">
          {cycleYear} EPB Cycle • SCOD: {epbConfig?.scod_date || "31 Mar"}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/entries?new=true">
            <Plus className="size-4 mr-2" />
            New Entry
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/generate">
            <Sparkles className="size-4 mr-2" />
            Generate EPB
          </Link>
        </Button>
        {(subordinates.length > 0 || profile?.role === "admin") && (
          <Button variant="outline" asChild>
            <Link href="/team">
              <Users className="size-4 mr-2" />
              View Team
            </Link>
          </Button>
        )}
      </div>

      {/* Pending Account Links */}
      <PendingLinksCard />

      {/* Pending Prior Data Reviews */}
      <PendingPriorDataCard />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEntries}</div>
            <p className="text-xs text-muted-foreground">
              For {cycleYear} cycle
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Calendar className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisMonth}</div>
            <p className="text-xs text-muted-foreground">New entries added</p>
          </CardContent>
        </Card>

        {(subordinates.length > 0 || profile?.role === "admin") && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Team Members
              </CardTitle>
              <Users className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{subordinates.length}</div>
              <p className="text-xs text-muted-foreground">
                Under your supervision
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Coverage</CardTitle>
            <Target className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.keys(stats.byMPA).length}/{mgas.length}
            </div>
            <p className="text-xs text-muted-foreground">MPAs with entries</p>
          </CardContent>
        </Card>
      </div>

      {/* EPB Progress - Only for military enlisted */}
      {profile?.rank !== "Civilian" && (
        <EPBProgressCard 
          rank={profile?.rank as Rank | null} 
          entries={accomplishments} 
        />
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

      {/* Recent Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Entries</CardTitle>
          <CardDescription>Your latest accomplishment entries</CardDescription>
        </CardHeader>
        <CardContent>
          {accomplishments.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="size-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium mb-2">No entries yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start tracking your accomplishments to generate quality EPB
                statements.
              </p>
              <Button asChild>
                <Link href="/entries?new=true">
                  <Plus className="size-4 mr-2" />
                  Create First Entry
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {accomplishments.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {mgas.find((m) => m.key === entry.mpa)?.label ||
                          entry.mpa}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="font-medium text-sm">
                      {entry.action_verb} - {entry.details.slice(0, 80)}
                      {entry.details.length > 80 ? "..." : ""}
                    </p>
                    {entry.impact && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Impact: {entry.impact.slice(0, 60)}
                        {entry.impact.length > 60 ? "..." : ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {accomplishments.length > 5 && (
                <div className="text-center">
                  <Button variant="ghost" asChild>
                    <Link href="/entries">View all entries →</Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-12 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

