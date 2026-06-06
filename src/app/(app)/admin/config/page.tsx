"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { Loader2, Shield, AlertTriangle, Users, ToggleRight, Wand2 } from "lucide-react";
import type { EPBConfig } from "@/types/database";

export default function AdminConfigPage() {
  const { profile, epbConfig, setEpbConfig } = useUserStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<EPBConfig | null>(null);

  const supabase = createClient();

  // Check admin access
  useEffect(() => {
    if (profile && profile.role !== "admin") {
      toast.error("Access denied. Admin only.");
      router.push("/dashboard");
    }
  }, [profile, router]);

  // Load config
  useEffect(() => {
    async function loadConfig() {
      const { data, error } = await supabase
        .from("epb_config")
        .select("*")
        .eq("id", 1)
        .single();

      if (!error && data) {
        setConfig(data);
      }
      setIsLoading(false);
    }

    loadConfig();
  }, [supabase]);

  async function handleSave() {
    if (!config) return;
    setIsSaving(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("epb_config")
        .update({
          enable_collaboration: config.enable_collaboration,
          show_prompt_editors: config.show_prompt_editors,
          enable_prompt_rules: config.enable_prompt_rules,
        })
        .eq("id", 1)
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data) {
        setConfig(data);
        setEpbConfig(data);
        toast.success("Configuration saved successfully");
      }
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="size-6" />
            Admin
          </h1>
          <p className="text-muted-foreground">
            App-wide settings for all users. AI prompts, character limits, and model pickers are
            configured individually under Settings → LLM and Settings → AI Models.
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
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

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ToggleRight className="size-5" />
            Feature Flags
          </CardTitle>
          <CardDescription>
            Enable or disable application features
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
              onCheckedChange={(checked) =>
                setConfig({ ...config, enable_collaboration: checked })
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
              onCheckedChange={(checked) =>
                setConfig({ ...config, enable_prompt_rules: checked })
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
              onCheckedChange={(checked) =>
                setConfig({ ...config, show_prompt_editors: checked })
              }
              aria-label="Show legacy prompt editors"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} size="lg">
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </div>
  );
}

