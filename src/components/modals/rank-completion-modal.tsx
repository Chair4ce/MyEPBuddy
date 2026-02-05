"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// Storage key is per-user to avoid cross-account dismissal issues
const getStorageKey = (userId: string) => `rank_modal_dismissed_${userId}`;

export function RankCompletionModal() {
  const { profile, setProfile } = useUserStore();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRank, setSelectedRank] = useState<Rank | "">("");
  const [afsc, setAfsc] = useState("");
  const [unit, setUnit] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // Check if we should show the modal
    if (!profile) return;

    // Don't show if user already has a rank
    if (profile.rank) return;

    // Don't show if user has dismissed it before (per-user check)
    const storageKey = getStorageKey(profile.id);
    const dismissed = localStorage.getItem(storageKey);
    if (dismissed === "true") return;

    // Show modal after a short delay for better UX
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [profile]);

  async function handleSaveProfile() {
    if (!selectedRank || !profile) return;

    setIsLoading(true);

    try {
      const updateData: { rank: Rank; afsc?: string; unit?: string } = {
        rank: selectedRank,
      };

      // Only include afsc and unit if they have values
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
      toast.success("Profile saved! EPB features are now enabled.");
      setIsOpen(false);
      localStorage.setItem(getStorageKey(profile.id), "true");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setIsLoading(false);
    }
  }

  function handleDismiss() {
    setIsOpen(false);
    if (profile) {
      localStorage.setItem(getStorageKey(profile.id), "true");
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Complete your profile</DialogTitle>
          <DialogDescription>
            Adding your rank unlocks key features in MyEPBuddy
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Rank selection */}
          <div className="space-y-2">
            <Label htmlFor="modal-rank">
              Rank <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedRank}
              onValueChange={(value) => setSelectedRank(value as Rank)}
            >
              <SelectTrigger id="modal-rank" aria-label="Select your rank">
                <SelectValue placeholder="Select your rank" />
              </SelectTrigger>
              <SelectContent>
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

          {/* AFSC */}
          <div className="space-y-2">
            <Label htmlFor="modal-afsc">AFSC</Label>
            <Input
              id="modal-afsc"
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

          {/* Unit */}
          <div className="space-y-2">
            <Label htmlFor="modal-unit">Unit</Label>
            <Input
              id="modal-unit"
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

          <p className="text-xs text-muted-foreground text-center pt-2">
            You can always update these later in Settings
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="w-full sm:w-auto"
          >
            I&apos;ll do this later
          </Button>
          <Button
            onClick={handleSaveProfile}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
