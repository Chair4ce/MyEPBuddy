"use client";

import { useState } from "react";
import { useUserStore } from "@/stores/user-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { motionTransitionColors } from "@/lib/motion/classes";

export function EmailPreferencesCard() {
  const { profile, setProfile } = useUserStore();
  const [pending, setPending] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const recorded = profile?.marketing_email_opt_in;
  const optedIn = pending ?? (profile ? recorded !== false : false);

  async function handleToggle(next: boolean) {
    if (!profile?.id || saving) return;
    setPending(next);
    setSaving(true);
    try {
      const response = await fetch("/api/settings/marketing-email-opt-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optedIn: next }),
      });
      if (!response.ok) {
        throw new Error("save_failed");
      }
      const body = (await response.json()) as {
        marketingEmailOptIn: boolean;
        marketingEmailOptInAt: string | null;
      };
      setProfile({
        ...profile,
        marketing_email_opt_in: body.marketingEmailOptIn,
        marketing_email_opt_in_at: body.marketingEmailOptInAt,
        marketing_email_opt_in_source: "settings",
      });
      setPending(null);
      toast.success(
        next
          ? "You will get EPB cycle reminder emails"
          : "EPB cycle reminder emails are off"
      );
    } catch {
      setPending(null);
      toast.error("Could not update email preference. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5" aria-hidden="true" />
          Email preferences
        </CardTitle>
        <CardDescription>
          Stop EPB closeout reminders here, or use Unsubscribe in the email.
          Invites, password reset, and feedback are not affected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border p-3",
            motionTransitionColors
          )}
        >
          <div className="min-w-0 space-y-1">
            <Label htmlFor="marketing-email-opt-in-settings" className="text-sm">
              EPB cycle reminders
            </Label>
            <p
              id="marketing-email-opt-in-settings-desc"
              className="text-sm text-muted-foreground leading-relaxed"
            >
              {recorded === false
                ? "You are not getting EPB cycle reminder emails. Turn this on if you want closeout reminders for your rank."
                : "We email you before your static closeout date so you can finish your EPB. Turn this off to stop those emails. You can also unsubscribe from any reminder — both work."}
              {" "}
              We do not send these to .mil addresses.
              {recorded == null
                ? " You have not changed this yet — reminders may still be sent until you turn this off."
                : null}
            </p>
          </div>
          <Switch
            id="marketing-email-opt-in-settings"
            checked={optedIn}
            disabled={!profile?.id || saving}
            onCheckedChange={handleToggle}
            aria-describedby="marketing-email-opt-in-settings-desc"
            className="mt-0.5 shrink-0"
          />
        </div>
      </CardContent>
    </Card>
  );
}
