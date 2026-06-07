"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { markRankModalDismissed } from "@/lib/rank-modal-storage";
import { Button } from "@/components/ui/button";
import {
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { ENLISTED_RANKS, OFFICER_RANKS, CIVILIAN_RANK } from "@/lib/constants";
import type { Rank, Profile } from "@/types/database";

export function RankStep() {
  const { profile, setProfile } = useUserStore();
  const [selectedRank, setSelectedRank] = useState<Rank | "">("");
  const [afsc, setAfsc] = useState("");
  const [unit, setUnit] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  function handleDismiss() {
    if (profile) {
      markRankModalDismissed(profile.id);
    }
  }

  async function handleSaveProfile() {
    if (!selectedRank || !profile) return;

    setIsLoading(true);

    try {
      const updateData: { rank: Rank; afsc?: string; unit?: string } = {
        rank: selectedRank,
      };

      if (afsc.trim()) {
        updateData.afsc = afsc.trim().toUpperCase();
      }
      if (unit.trim()) {
        updateData.unit = unit.trim();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("profiles")
        .update(updateData)
        .eq("id", profile.id)
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      setProfile(data as Profile);
      markRankModalDismissed(profile.id);
      toast.success("Profile saved! EPB features are now enabled.");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-[min(100vw-1.5rem,36rem)] max-w-full p-6 md:p-8">
      <AlertDialogHeader>
        <AlertDialogTitle className="text-xl md:text-2xl">
          Complete your profile
        </AlertDialogTitle>
        <AlertDialogDescription>
          Adding your rank unlocks key features in MyEPBuddy
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="space-y-4 py-4 md:py-5">
        <div className="space-y-2">
          <Label htmlFor="onboarding-rank">
            Rank <span className="text-destructive">*</span>
          </Label>
          <Select
            value={selectedRank}
            onValueChange={(value) => setSelectedRank(value as Rank)}
          >
            <SelectTrigger
              id="onboarding-rank"
              aria-label="Select your rank"
              className="w-full md:max-w-sm"
            >
              <SelectValue placeholder="Select your rank" />
            </SelectTrigger>
            <SelectContent elevated>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Enlisted
              </div>
              {ENLISTED_RANKS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.value}
                </SelectItem>
              ))}
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">
                Officer
              </div>
              {OFFICER_RANKS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.value}
                </SelectItem>
              ))}
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">
                Civilian
              </div>
              {CIVILIAN_RANK.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="onboarding-afsc">AFSC</Label>
            <Input
              id="onboarding-afsc"
              placeholder="e.g., 3D0X2"
              value={afsc}
              onChange={(e) => setAfsc(e.target.value)}
              maxLength={10}
              aria-label="Enter your AFSC"
            />
            <p className="text-xs text-muted-foreground">
              Your Air Force Specialty Code
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="onboarding-unit">Unit</Label>
            <Input
              id="onboarding-unit"
              placeholder="e.g., 42 CS/SCOO"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={50}
              aria-label="Enter your unit"
            />
            <p className="text-xs text-muted-foreground">
              Your squadron or office symbol
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center pt-1">
          You can always update these later in Settings
        </p>
      </div>

      <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
        <Button
          variant="ghost"
          onClick={handleDismiss}
          className="w-full sm:w-auto"
        >
          I&apos;ll do this later
        </Button>
        <Button
          onClick={() => void handleSaveProfile()}
          disabled={!selectedRank || isLoading}
          className="w-full sm:w-auto"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4 mr-2" />
              Save Profile
            </>
          )}
        </Button>
      </AlertDialogFooter>
    </div>
  );
}
