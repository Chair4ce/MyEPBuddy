"use client";

import { useState } from "react";
import { Award as AwardIcon, Link2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AwardFields,
  emptyAwardFieldsValue,
  validateAwardFields,
  type AwardFieldsTeamMemberOption,
  type AwardFieldsValue,
} from "@/components/awards/award-fields";
import { toast } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/client";
import { getQuarterDateRange } from "@/lib/constants";
import {
  composeRecognitionPhrase,
  formatAwardShortLabel,
} from "@/lib/award-recognition";
import { cn } from "@/lib/utils";
import { motionChip, motionCollapseGrid } from "@/lib/motion/classes";
import { useAwardsStore } from "@/stores/awards-store";
import { useUserStore } from "@/stores/user-store";
import type { Award } from "@/types/database";

type RecognitionImpactFieldsProps = {
  linkedAwards: Award[];
  onLinkedAwardsChange: (awards: Award[]) => void;
  /** Ratee profile id (self or subordinate); mutually exclusive with managed id */
  recipientProfileId?: string | null;
  recipientTeamMemberId?: string | null;
  disabled?: boolean;
};

export function RecognitionImpactFields({
  linkedAwards,
  onLinkedAwardsChange,
  recipientProfileId,
  recipientTeamMemberId,
  disabled = false,
}: RecognitionImpactFieldsProps) {
  const { profile, subordinates, managedMembers } = useUserStore();
  const { addAward, setAwards, getAwardsForMember } = useAwardsStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadingAwards, setLoadingAwards] = useState(false);
  const [draft, setDraft] = useState<AwardFieldsValue>(() =>
    emptyAwardFieldsValue()
  );

  async function ensureRateeAwardsLoaded() {
    if (loadingAwards) return;

    setLoadingAwards(true);
    const supabase = createClient();
    try {
      let query = supabase.from("awards").select("*");
      if (recipientTeamMemberId) {
        query = query.eq("recipient_team_member_id", recipientTeamMemberId);
      } else if (recipientProfileId) {
        query = query.eq("recipient_profile_id", recipientProfileId);
      } else {
        return;
      }
      const { data, error } = await query.order("created_at", {
        ascending: false,
      });
      if (error) throw error;
      const fetched = (data || []) as Award[];
      const current = useAwardsStore.getState().awards;
      const others = current.filter(
        (a) =>
          !(
            (recipientProfileId &&
              a.recipient_profile_id === recipientProfileId) ||
            (recipientTeamMemberId &&
              a.recipient_team_member_id === recipientTeamMemberId)
          )
      );
      setAwards([...fetched, ...others]);
    } catch (err) {
      console.error("Failed to load ratee awards:", err);
    } finally {
      setLoadingAwards(false);
    }
  }

  const rateeAwards = getAwardsForMember(
    recipientProfileId || undefined,
    recipientTeamMemberId || undefined
  );
  // Include already-linked awards even if store hasn't loaded the full ratee set yet
  const availableById = new Map<string, Award>();
  for (const a of rateeAwards) availableById.set(a.id, a);
  for (const a of linkedAwards) availableById.set(a.id, a);
  const available = Array.from(availableById.values());

  const linkedIds = new Set(linkedAwards.map((a) => a.id));
  const unlinked = available.filter((a) => !linkedIds.has(a.id));

  const teamMemberOptions: AwardFieldsTeamMemberOption[] = [
    ...subordinates.map((s) => ({
      id: s.id,
      name: s.full_name || "Unknown",
      rank: s.rank,
      type: "profile" as const,
    })),
    ...managedMembers
      .filter((m) => m.member_status === "active")
      .map((m) => ({
        id: m.id,
        name: m.full_name || "Unknown",
        rank: m.rank,
        type: "team_member" as const,
      })),
  ].filter(
    (r) =>
      !(
        (recipientProfileId &&
          r.type === "profile" &&
          r.id === recipientProfileId) ||
        (recipientTeamMemberId &&
          r.type === "team_member" &&
          r.id === recipientTeamMemberId)
      )
  );

  const recognitionPreview = composeRecognitionPhrase(linkedAwards);

  function linkAward(award: Award) {
    if (linkedIds.has(award.id)) return;
    onLinkedAwardsChange([...linkedAwards, award]);
  }

  function unlinkAward(id: string) {
    onLinkedAwardsChange(linkedAwards.filter((a) => a.id !== id));
  }

  async function handleCreateAward() {
    if (!profile) return;
    const error = validateAwardFields(draft);
    if (error) {
      toast.error(error);
      return;
    }
    if (!recipientProfileId && !recipientTeamMemberId) {
      toast.error("No recipient for this award");
      return;
    }

    setCreating(true);
    const supabase = createClient();
    try {
      const currentYear = new Date().getFullYear();
      const cycleYear =
        draft.awardType === "coin" ? currentYear : draft.awardYear;
      const finalAwardName =
        draft.selectedCatalogAward || draft.awardName || null;
      const isTeamAward = draft.awardCategory === "team";

      let periodStart: string | null = null;
      let periodEnd: string | null = null;
      if (draft.awardType === "quarterly") {
        const dates = getQuarterDateRange(draft.quarter, draft.awardYear);
        periodStart = dates.start;
        periodEnd = dates.end;
      } else if (draft.awardType === "annual") {
        periodStart = `${draft.awardYear}-01-01`;
        periodEnd = `${draft.awardYear}-12-31`;
      }

      // Self-entry: supervisor_id = self (RLS allows own received awards).
      // Supervisor entry for ratee: supervisor_id = profile.id.
      const { data: award, error: awardError } = await supabase
        .from("awards")
        .insert({
          recipient_profile_id: recipientProfileId || null,
          recipient_team_member_id: recipientTeamMemberId || null,
          created_by: profile.id,
          supervisor_id: profile.id,
          award_type: draft.awardType,
          award_name: finalAwardName,
          coin_presenter:
            draft.awardType === "coin" ? draft.coinPresenter : null,
          coin_description:
            draft.awardType === "coin"
              ? draft.coinDescription || null
              : null,
          coin_date: draft.awardType === "coin" ? draft.coinDate : null,
          quarter: draft.awardType === "quarterly" ? draft.quarter : null,
          award_year: ["quarterly", "annual", "special"].includes(
            draft.awardType
          )
            ? draft.awardYear
            : null,
          period_start: periodStart,
          period_end: periodEnd,
          award_level: ["quarterly", "annual"].includes(draft.awardType)
            ? draft.awardLevel
            : null,
          award_category: ["quarterly", "annual"].includes(draft.awardType)
            ? draft.awardCategory
            : null,
          is_team_award: isTeamAward,
          cycle_year: cycleYear,
        } as never)
        .select()
        .single();

      if (awardError) throw awardError;
      const typedAward = award as Award;

      if (isTeamAward && draft.selectedTeamMemberIds.length > 0) {
        const teamMemberInserts = draft.selectedTeamMemberIds.map(
          (memberId) => {
            const member = teamMemberOptions.find((r) => r.id === memberId);
            return {
              award_id: typedAward.id,
              profile_id: member?.type === "profile" ? memberId : null,
              team_member_id:
                member?.type === "team_member" ? memberId : null,
            };
          }
        );
        const { error: teamError } = await supabase
          .from("award_team_members")
          .insert(teamMemberInserts as never);
        if (teamError) throw teamError;
      }

      addAward(typedAward);
      onLinkedAwardsChange([...linkedAwards, typedAward]);
      setDraft(emptyAwardFieldsValue());
      setCreateOpen(false);
      toast.success("Award added and linked");
    } catch (err) {
      console.error("Error creating award from entry:", err);
      toast.error("Failed to add award");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-sm flex items-center gap-1.5">
          <AwardIcon className="size-3.5 text-muted-foreground" />
          Recognition
          <span className="text-muted-foreground font-normal text-xs">
            (optional impact)
          </span>
        </Label>
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(motionChip, "h-7 text-xs")}
            disabled={disabled}
            aria-expanded={pickerOpen}
            aria-label="Link existing award"
            onClick={() => {
              setPickerOpen((o) => {
                const next = !o;
                if (next) void ensureRateeAwardsLoaded();
                return next;
              });
              setCreateOpen(false);
            }}
          >
            <Link2 className="size-3 mr-1" />
            {loadingAwards ? "Loading…" : "Link"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(motionChip, "h-7 text-xs")}
            disabled={disabled}
            aria-expanded={createOpen}
            aria-label="Create and link award"
            onClick={() => {
              setCreateOpen((o) => {
                const next = !o;
                if (next) setDraft(emptyAwardFieldsValue());
                return next;
              });
              setPickerOpen(false);
            }}
          >
            <Plus className="size-3 mr-1" />
            New
          </Button>
        </div>
      </div>

      {linkedAwards.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Linked awards">
          {linkedAwards.map((award) => (
            <Badge
              key={award.id}
              variant="secondary"
              className="gap-1 pr-1 max-w-full"
              role="listitem"
            >
              <span className="truncate">{formatAwardShortLabel(award)}</span>
              <button
                type="button"
                className={cn(motionChip, "rounded-sm p-0.5 hover:bg-muted")}
                aria-label={`Remove ${formatAwardShortLabel(award)}`}
                disabled={disabled}
                onClick={() => unlinkAward(award.id)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {recognitionPreview && (
        <p className="text-xs text-muted-foreground">
          Impact phrase:{" "}
          <span className="text-foreground/80 italic">{recognitionPreview}</span>
        </p>
      )}

      <div
        className={motionCollapseGrid}
        data-open={pickerOpen ? "true" : "false"}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-1 space-y-2">
            {unlinked.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No other awards on file for this ratee. Create one with New.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {unlinked.map((award) => (
                  <Badge
                    key={award.id}
                    variant="outline"
                    className={cn(motionChip, "cursor-pointer")}
                    onClick={() => !disabled && linkAward(award)}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    onKeyDown={(e) => {
                      if (disabled) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        linkAward(award);
                      }
                    }}
                  >
                    {formatAwardShortLabel(award)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={motionCollapseGrid}
        data-open={createOpen ? "true" : "false"}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-2 space-y-3 rounded-lg p-3 bg-muted/30 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_2px_4px_rgba(0,0,0,0.02),0_0_0_0.5px_rgba(0,0,0,0.08)]">
            <AwardFields
              value={draft}
              onChange={setDraft}
              teamMemberOptions={teamMemberOptions}
              disabled={disabled || creating}
              idPrefix="entry-award"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={disabled || creating}
                onClick={() => void handleCreateAward()}
              >
                {creating ? "Adding…" : "Add & link"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
