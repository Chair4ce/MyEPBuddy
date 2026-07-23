"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MailWarning, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useClientReady } from "@/lib/client-ready";

type MismatchLink = {
  id: string;
  invited_email: string | null;
  signup_email: string | null;
  team_member: {
    id: string;
    full_name: string;
    email: string | null;
  };
  invitee: {
    full_name: string | null;
    email: string | null;
  } | null;
};

type PendingRow = {
  id: string;
  invited_email: string | null;
  signup_email: string | null;
  team_member_id: string;
  user_id: string;
};

/**
 * Loads once when the client is ready — avoids useEffect by using a
 * render-gated async kickoff with local state.
 */
export function EmailMismatchInvitesCard() {
  const { profile, updateManagedMember } = useUserStore();
  const clientReady = useClientReady();
  const [links, setLinks] = useState<MismatchLink[] | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadStarted, setLoadStarted] = useState(false);
  const supabase = createClient();

  if (clientReady && profile?.id && !loadStarted) {
    setLoadStarted(true);
    void (async () => {
      const { data: ownedMembers, error: membersError } = (await supabase
        .from("team_members")
        .select("id")
        .eq("supervisor_id", profile.id)) as {
        data: { id: string }[] | null;
        error: Error | null;
      };

      if (membersError) {
        console.error("Email mismatch members:", membersError);
        setLinks([]);
        return;
      }

      const memberIds = (ownedMembers || []).map((m) => m.id);
      if (memberIds.length === 0) {
        setLinks([]);
        return;
      }

      const { data, error } = (await supabase
        .from("pending_managed_links")
        .select("id, invited_email, signup_email, team_member_id, user_id")
        .eq("email_mismatch", true)
        .eq("email_update_status", "pending")
        .in("team_member_id", memberIds)) as {
        data: PendingRow[] | null;
        error: Error | null;
      };

      if (error || !data?.length) {
        if (error) console.error("Email mismatch links:", error);
        setLinks([]);
        return;
      }

      const teamIds = data.map((row) => row.team_member_id);
      const userIds = data.map((row) => row.user_id);

      const [{ data: members }, { data: profiles }] = await Promise.all([
        supabase
          .from("team_members")
          .select("id, full_name, email")
          .in("id", teamIds),
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds),
      ]);

      const memberMap = new Map(
        ((members || []) as { id: string; full_name: string; email: string | null }[]).map(
          (m) => [m.id, m]
        )
      );
      const profileMap = new Map(
        ((profiles || []) as { id: string; full_name: string | null; email: string | null }[]).map(
          (p) => [p.id, p]
        )
      );

      setLinks(
        data
          .map((row) => {
            const member = memberMap.get(row.team_member_id);
            if (!member) return null;
            return {
              id: row.id,
              invited_email: row.invited_email,
              signup_email: row.signup_email,
              team_member: member,
              invitee: profileMap.get(row.user_id) || null,
            };
          })
          .filter(Boolean) as MismatchLink[]
      );
    })();
  }

  async function resolve(linkId: string, accept: boolean) {
    setLoadingId(linkId);
    try {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: { p_link_id: string; p_accept: boolean }
        ) => Promise<{
          data: {
            success?: boolean;
            accepted?: boolean;
            updated_email?: string;
            member_name?: string;
            error?: string;
          } | null;
          error: { message?: string } | null;
        }>
      )("resolve_managed_link_email_update", {
        p_link_id: linkId,
        p_accept: accept,
      });

      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Could not update email");
        return;
      }

      const link = links?.find((l) => l.id === linkId);
      if (accept && link && data.updated_email) {
        updateManagedMember(link.team_member.id, { email: data.updated_email });
        toast.success(`Updated ${data.member_name || "member"} email`, {
          description: data.updated_email,
        });
      } else {
        toast.success("Kept the original managed account email");
      }

      setLinks((prev) => (prev || []).filter((l) => l.id !== linkId));
    } finally {
      setLoadingId(null);
    }
  }

  if (!links || links.length === 0) {
    return null;
  }

  return (
    <Card
      id="managed-email-updates"
      className="border-sky-300/80 dark:border-sky-700/50 bg-sky-50/40 dark:bg-sky-950/20 scroll-mt-24 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_2px_4px_rgba(0,0,0,0.02),0_0_0_0.5px_rgba(14,165,233,0.35)]"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sky-700 dark:text-sky-300">
          <MailWarning className="size-5" />
          Managed account email updates
        </CardTitle>
        <CardDescription>
          Someone accepted your invite with a different email than you saved.
          Update the managed account so team features stay in sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {links.map((link) => (
          <div
            key={link.id}
            className="rounded-lg border bg-card p-4 space-y-3"
          >
            <div>
              <p className="font-medium">{link.team_member.full_name}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Invited as{" "}
                <span className="font-medium text-foreground">
                  {link.invited_email || link.team_member.email || "—"}
                </span>
                {" · "}
                Signed up as{" "}
                <span className="font-medium text-foreground">
                  {link.signup_email || link.invitee?.email || "—"}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={loadingId === link.id}
                onClick={() => void resolve(link.id, true)}
                aria-label={`Update email for ${link.team_member.full_name}`}
                className="active:scale-[0.98] transition-transform duration-150"
              >
                {loadingId === link.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Update managed email"
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loadingId === link.id}
                onClick={() => void resolve(link.id, false)}
                aria-label={`Keep original email for ${link.team_member.full_name}`}
                className="active:scale-[0.98] transition-transform duration-150"
              >
                Keep original
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
