"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { Loader2, Shield, AlertTriangle, Users, ToggleRight, Wand2, Coins } from "lucide-react";
import { AdminTokenGrantPanel } from "@/components/admin/admin-token-grant-panel";
import type { EPBConfig } from "@/types/database";

type FeatureFlagKey =
  | "enable_collaboration"
  | "enable_prompt_rules"
  | "show_prompt_editors";

export default function AdminConfigPage() {
  const { profile, setEpbConfig } = useUserStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [savingField, setSavingField] = useState<FeatureFlagKey | null>(null);
  const [savingTrialCredits, setSavingTrialCredits] = useState(false);
  const [trialCreditsInput, setTrialCreditsInput] = useState("20");
  const [config, setConfig] = useState<EPBConfig | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (profile && profile.role !== "admin") {
      toast.error("Access denied. Admin only.");
      router.push("/dashboard");
    }
  }, [profile, router]);

  useEffect(() => {
    async function loadConfig() {
      const { data, error } = await supabase
        .from("epb_config")
        .select("*")
        .eq("id", 1)
        .single();

      if (!error && data) {
        const nextConfig = data as EPBConfig;
        setConfig(nextConfig);
        setTrialCreditsInput(String(nextConfig.signup_trial_credits ?? 20));
      }
      setIsLoading(false);
    }

    loadConfig();
  }, [supabase]);

  async function updateFlag(key: FeatureFlagKey, checked: boolean) {
    if (!config) return;

    const previous = config[key];
    setConfig({ ...config, [key]: checked });
    setSavingField(key);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("epb_config")
        .update({ [key]: checked })
        .eq("id", 1)
        .select()
        .single();

      if (error) {
        setConfig({ ...config, [key]: previous });
        toast.error(error.message);
        return;
      }

      if (data) {
        setConfig(data);
        setEpbConfig(data);
      }
    } catch {
      setConfig({ ...config, [key]: previous });
      toast.error("Failed to update setting");
    } finally {
      setSavingField(null);
    }
  }

  async function saveSignupTrialCredits() {
    if (!config) return;

    const parsed = parseInt(trialCreditsInput, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 1000) {
      toast.error("Enter a whole number between 1 and 1000.");
      return;
    }

    const previous = config.signup_trial_credits;
    setConfig({ ...config, signup_trial_credits: parsed });
    setSavingTrialCredits(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("epb_config")
        .update({ signup_trial_credits: parsed })
        .eq("id", 1)
        .select()
        .single();

      if (error) {
        setConfig({ ...config, signup_trial_credits: previous });
        toast.error(error.message);
        return;
      }

      if (data) {
        setConfig(data);
        setEpbConfig(data);
        setTrialCreditsInput(String(data.signup_trial_credits));
      }

      toast.success("Signup trial tokens updated for new accounts only.");
    } catch {
      setConfig({ ...config, signup_trial_credits: previous });
      toast.error("Failed to update signup trial tokens");
    } finally {
      setSavingTrialCredits(false);
    }
  }

  if (profile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="size-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">
          This page is only accessible to administrators.
        </p>
      </div>
    );
  }

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="size-6" />
          Admin
        </h1>
        <p className="text-muted-foreground">
          App-wide settings for all users. AI prompts, character limits, and model pickers are
          configured individually under Settings → LLM and Settings → My API Keys.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evaluation cycles</CardTitle>
          <CardDescription>
            Cycle year is computed per member from their rank SCOD tier — not configured here.
            When you write an EPB for someone else, the app uses their rank to determine the active cycle.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="size-5" />
            AI Tokens
          </CardTitle>
          <CardDescription>
            Configure signup trial grants and manually add tokens to existing accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-2 flex-1 max-w-xs">
              <Label htmlFor="signup_trial_credits">Signup trial grant</Label>
              <Input
                id="signup_trial_credits"
                type="number"
                min={1}
                max={1000}
                inputMode="numeric"
                value={trialCreditsInput}
                onChange={(e) => setTrialCreditsInput(e.target.value)}
                aria-label="Signup trial tokens"
                className="tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Current value: {config.signup_trial_credits} tokens for new signups
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void saveSignupTrialCredits()}
              disabled={
                savingTrialCredits ||
                parseInt(trialCreditsInput, 10) === config.signup_trial_credits
              }
              className="sm:mb-0.5"
            >
              {savingTrialCredits ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </div>

          <AdminTokenGrantPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ToggleRight className="size-5" />
            Feature Flags
          </CardTitle>
          <CardDescription>
            Enable or disable application features. Changes save automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Users className="size-5 text-muted-foreground" />
              <div>
                <Label htmlFor="enable_collaboration" className="text-base font-medium">
                  Multi-User Collaboration
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Allow users to collaborate on EPB statements in real-time with session codes
                </p>
              </div>
            </div>
            <Switch
              id="enable_collaboration"
              checked={config.enable_collaboration}
              disabled={savingField === "enable_collaboration"}
              onCheckedChange={(checked) =>
                void updateFlag("enable_collaboration", checked)
              }
              aria-label="Enable multi-user collaboration"
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Wand2 className="size-5 text-muted-foreground" />
              <div>
                <Label htmlFor="enable_prompt_rules" className="text-base font-medium">
                  Per-Context Prompt Rules
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Let users define short rules per context (EPB, Award, WAR, etc.) that are
                  appended to canonical prompts at generation time
                </p>
              </div>
            </div>
            <Switch
              id="enable_prompt_rules"
              checked={config.enable_prompt_rules}
              disabled={savingField === "enable_prompt_rules"}
              onCheckedChange={(checked) =>
                void updateFlag("enable_prompt_rules", checked)
              }
              aria-label="Enable per-context prompt rules"
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Wand2 className="size-5 text-muted-foreground" />
              <div>
                <Label htmlFor="show_prompt_editors" className="text-base font-medium">
                  Legacy Prompt Editors
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Show raw system/style prompt textareas in LLM settings and modals. When off,
                  prompt editors are replaced by the Rules manager (if rules are enabled)
                </p>
              </div>
            </div>
            <Switch
              id="show_prompt_editors"
              checked={config.show_prompt_editors}
              disabled={savingField === "show_prompt_editors"}
              onCheckedChange={(checked) =>
                void updateFlag("show_prompt_editors", checked)
              }
              aria-label="Show legacy prompt editors"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
