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
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { Loader2, Key, Eye, EyeOff, Shield, ExternalLink } from "lucide-react";
import type { UserAPIKeys } from "@/types/database";

interface APIKeys {
  openai_key: string;
  anthropic_key: string;
  google_key: string;
  grok_key: string;
}

export default function APIKeysPage() {
  const { profile } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [keys, setKeys] = useState<APIKeys>({
    openai_key: "",
    anthropic_key: "",
    google_key: "",
    grok_key: "",
  });
  const [hasExisting, setHasExisting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function loadKeys() {
      if (!profile) return;
      setIsLoading(true);

      const { data, error } = await supabase
        .from("user_api_keys")
        .select("*")
        .eq("user_id", profile.id)
        .single();

      if (!error && data) {
        const typedData = data as unknown as UserAPIKeys;
        setHasExisting(true);
        // Show masked values for existing keys
        setKeys({
          openai_key: typedData.openai_key ? "••••••••••••••••" : "",
          anthropic_key: typedData.anthropic_key ? "••••••••••••••••" : "",
          google_key: typedData.google_key ? "••••••••••••••••" : "",
          grok_key: typedData.grok_key ? "••••••••••••••••" : "",
        });
      }

      setIsLoading(false);
    }

    loadKeys();
  }, [profile, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload: Record<string, string | null> = {
        user_id: profile?.id || "",
      };

      // Only include non-masked values
      if (keys.openai_key && !keys.openai_key.includes("••")) {
        payload.openai_key = keys.openai_key;
      }
      if (keys.anthropic_key && !keys.anthropic_key.includes("••")) {
        payload.anthropic_key = keys.anthropic_key;
      }
      if (keys.google_key && !keys.google_key.includes("••")) {
        payload.google_key = keys.google_key;
      }
      if (keys.grok_key && !keys.grok_key.includes("••")) {
        payload.grok_key = keys.grok_key;
      }

      let error;

      if (hasExisting) {
        // Remove user_id from update payload
        const { user_id, ...updatePayload } = payload;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (supabase as any)
          .from("user_api_keys")
          .update(updatePayload)
          .eq("user_id", profile?.id);
        error = result.error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (supabase as any).from("user_api_keys").insert(payload);
        error = result.error;
      }

      if (error) {
        toast.error(error.message);
        return;
      }

      setHasExisting(true);
      toast.success("API keys saved successfully");
    } catch {
      toast.error("Failed to save API keys");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear(keyName: keyof APIKeys) {
    if (!hasExisting) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("user_api_keys")
        .update({ [keyName]: null })
        .eq("user_id", profile?.id);

      if (error) {
        toast.error("Failed to clear key");
        return;
      }

      setKeys({ ...keys, [keyName]: "" });
      toast.success("API key cleared");
    } catch {
      toast.error("Failed to clear key");
    }
  }

  const providers = [
    {
      key: "openai_key" as keyof APIKeys,
      name: "OpenAI",
      description: "GPT-4o and GPT-4o Mini",
      url: "https://platform.openai.com/api-keys",
    },
    {
      key: "anthropic_key" as keyof APIKeys,
      name: "Anthropic",
      description: "Claude Sonnet and Claude Haiku",
      url: "https://console.anthropic.com/settings/keys",
    },
    {
      key: "google_key" as keyof APIKeys,
      name: "Google AI",
      description: "Gemini 1.5 Pro and Flash",
      url: "https://aistudio.google.com/app/apikey",
    },
    {
      key: "grok_key" as keyof APIKeys,
      name: "xAI",
      description: "Grok 2",
      url: "https://x.ai/api",
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
        <p className="text-muted-foreground">
          Add your own API keys to use your preferred AI models
        </p>
      </div>

      <Card className="border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="">
          <div className="flex gap-3">
            <Shield className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Your keys are encrypted and secure
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                API keys are encrypted before storage and only decrypted during
                generation requests. They are never logged or shared.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Key className="size-5 text-primary" />
              </div>
              <div>
                <CardTitle>LLM Provider Keys</CardTitle>
                <CardDescription>
                  Using your own keys gives you more control and potentially
                  lower costs
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="show-keys" className="text-sm text-muted-foreground">
                Show keys
              </Label>
              <Switch
                id="show-keys"
                checked={showKeys}
                onCheckedChange={setShowKeys}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {providers.map((provider) => (
              <div key={provider.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={provider.key}>{provider.name}</Label>
                  <a
                    href={provider.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Get API Key
                    <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="flex gap-2">
                  <Input
                    id={provider.key}
                    type={showKeys ? "text" : "password"}
                    value={keys[provider.key]}
                    onChange={(e) =>
                      setKeys({ ...keys, [provider.key]: e.target.value })
                    }
                    placeholder={`Enter your ${provider.name} API key`}
                    className="font-mono text-sm"
                    aria-label={`${provider.name} API key`}
                  />
                  {keys[provider.key] && keys[provider.key].includes("••") && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleClear(provider.key)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {provider.description}
                </p>
              </div>
            ))}

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save API Keys"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            When you generate EPB statements, the app will check if you have an
            API key for the selected model&apos;s provider:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong className="text-foreground">With your key:</strong> Your
              key is used directly, giving you full control over usage and
              billing
            </li>
            <li>
              <strong className="text-foreground">Without your key:</strong> The
              app&apos;s default API key is used (shared resource)
            </li>
          </ul>
          <p>
            Adding your own keys ensures faster, more reliable access and helps
            keep the service running for everyone.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

