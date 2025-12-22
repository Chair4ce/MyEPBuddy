"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { 
  RANKS, 
  getStaticCloseoutDate, 
  getDaysUntilCloseout, 
  getCycleProgress,
  RANK_TO_TIER 
} from "@/lib/constants";
import { Loader2, User, Calendar, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Rank, Profile } from "@/types/database";

export default function SettingsPage() {
  const { profile, setProfile } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    rank: "" as Rank | "",
    afsc: "",
    unit: "",
  });

  const supabase = createClient();

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || "",
        rank: profile.rank || "",
        afsc: profile.afsc || "",
        unit: profile.unit || "",
      });
    }
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("profiles")
        .update({
          full_name: form.full_name,
          rank: form.rank || null,
          afsc: form.afsc || null,
          unit: form.unit || null,
        })
        .eq("id", profile?.id)
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      setProfile(data as Profile);
      toast.success("Profile updated successfully");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground">
          Manage your personal information and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                Update your profile details used across the app
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile?.email || ""}
                disabled
                className="bg-muted"
                aria-label="Email (read-only)"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) =>
                    setForm({ ...form, full_name: e.target.value })
                  }
                  placeholder="John Doe"
                  aria-label="Full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rank">Rank</Label>
                <Select
                  value={form.rank}
                  onValueChange={(value) =>
                    setForm({ ...form, rank: value as Rank })
                  }
                >
                  <SelectTrigger id="rank" aria-label="Select rank">
                    <SelectValue placeholder="Select rank" />
                  </SelectTrigger>
                  <SelectContent>
                    {RANKS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="afsc">AFSC</Label>
                <Input
                  id="afsc"
                  value={form.afsc}
                  onChange={(e) =>
                    setForm({ ...form, afsc: e.target.value.toUpperCase() })
                  }
                  placeholder="1N0X1"
                  aria-label="Air Force Specialty Code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="25 IS"
                  aria-label="Unit"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Role</CardTitle>
          <CardDescription>
            Your account type and team relationships
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                profile?.role === "admin"
                  ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              }`}
            >
              {profile?.role === "admin" ? "Administrator" : "Member"}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Team relationships determine who you can supervise and who supervises you. 
            Visit the Team page to manage your supervision relationships.
          </p>
        </CardContent>
      </Card>

      {/* EPB Close-out Date Card */}
      <EPBCloseoutCard rank={profile?.rank || null} />
    </div>
  );
}

// EPB Close-out Information Card
function EPBCloseoutCard({ rank }: { rank: Rank | null }) {
  const tier = rank ? RANK_TO_TIER[rank] : null;
  const closeout = getStaticCloseoutDate(rank);
  const daysUntil = getDaysUntilCloseout(rank);
  const cycleProgress = getCycleProgress(rank);

  // Civilians don't have EPBs - don't show this card
  if (rank === "Civilian") {
    return null;
  }

  // AB and Amn don't have EPBs
  if (rank && (rank === "AB" || rank === "Amn")) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center">
              <Calendar className="size-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>EPB Close-out Date</CardTitle>
              <CardDescription>
                Static close-out date for your rank
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Airmen with rank AB or Amn do not submit EPBs. Your first EPB will be when you reach Senior Airman (SrA) and will include all entries since you joined the Air Force.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!rank || !tier || !closeout) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center">
              <Calendar className="size-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>EPB Close-out Date</CardTitle>
              <CardDescription>
                Static close-out date for your rank
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Set your rank above to see your EPB close-out date.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full flex items-center justify-center bg-primary/10">
            <Calendar className="size-5 text-primary" />
          </div>
          <div>
            <CardTitle>EPB Close-out Date</CardTitle>
            <CardDescription>
              Static close-out date for {rank}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Close-out date display */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
          <div>
            <p className="text-sm text-muted-foreground">Your EPB Close-out</p>
            <p className="text-2xl font-bold">
              {closeout.label}, {closeout.date.getFullYear()}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end text-foreground">
              <Clock className="size-4" />
              <span className="text-sm font-medium">
                {daysUntil !== null ? (
                  daysUntil === 0 ? "Today!" : 
                  daysUntil === 1 ? "Tomorrow" :
                  daysUntil < 0 ? `${Math.abs(daysUntil)} days ago` :
                  `${daysUntil} days`
                ) : "—"}
              </span>
            </div>
            <p className="text-xs mt-0.5 opacity-80">
              {daysUntil !== null && daysUntil > 0 ? "until close-out" : daysUntil === 0 ? "" : "since close-out"}
            </p>
          </div>
        </div>

        {/* Cycle progress */}
        {cycleProgress !== null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Performance Cycle Progress</span>
              <span className="font-medium">{Math.round(cycleProgress)}%</span>
            </div>
            <Progress value={cycleProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {cycleProgress < 25 ? "Early in your cycle—great time to start logging entries!" :
               cycleProgress < 50 ? "Good progress—keep adding accomplishments throughout the year." :
               cycleProgress < 75 ? "Past the halfway point—ensure all major accomplishments are logged." :
               cycleProgress < 90 ? "Approaching close-out—finalize your entries soon." :
               "Close-out approaching—submit your EPB to your supervisor!"}
            </p>
          </div>
        )}

        {/* Info about dates */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
          <p><strong>Note:</strong> This is the official AF static close-out date for your rank tier.</p>
          <p>Typically, units require your finalized EPB 60 days before close-out.</p>
        </div>
      </CardContent>
    </Card>
  );
}

