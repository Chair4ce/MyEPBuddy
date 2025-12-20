"use client";

import { useState, useEffect } from "react";
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
import { toast } from "@/components/ui/sonner";
import { Loader2, Key, Shield, ExternalLink, Check, Trash2, ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getKeyStatus,
  saveApiKey,
  deleteApiKey,
  type KeyStatus,
  type KeyName,
} from "@/app/actions/api-keys";

interface Provider {
  key: KeyName;
  name: string;
  description: string;
  url: string;
}

const providers: Provider[] = [
  {
    key: "openai_key",
    name: "OpenAI",
    description: "GPT-4o and GPT-4o Mini",
    url: "https://platform.openai.com/api-keys",
  },
  {
    key: "anthropic_key",
    name: "Anthropic",
    description: "Claude Sonnet and Claude Haiku",
    url: "https://console.anthropic.com/settings/keys",
  },
  {
    key: "google_key",
    name: "Google AI",
    description: "Gemini 1.5 Pro and Flash",
    url: "https://aistudio.google.com/app/apikey",
  },
  {
    key: "grok_key",
    name: "xAI",
    description: "Grok 2",
    url: "https://x.ai/api",
  },
];

function ProviderKeyCard({
  provider,
  hasKey,
  onSave,
  onDelete,
}: {
  provider: Provider;
  hasKey: boolean;
  onSave: (key: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [newKey, setNewKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleSave() {
    if (!newKey.trim()) {
      toast.error("Please enter an API key");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(newKey.trim());
      setNewKey("");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-medium">{provider.name}</Label>
          <p className="text-xs text-muted-foreground">{provider.description}</p>
        </div>
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

      {hasKey ? (
        <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-md px-3 py-2">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <Check className="size-4" />
            <span className="text-sm font-medium">API key saved</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {isDeleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={`Enter your ${provider.name} API key`}
            className="font-mono text-sm"
            aria-label={`${provider.name} API key`}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          <Button onClick={handleSave} disabled={isSaving || !newKey.trim()}>
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Save"
            )}
          </Button>
        </div>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {provider.name} API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your {provider.name} API key. You&apos;ll need to add a new key to use {provider.name} models again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : null}
              Delete Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function APIKeysPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({
    openai_key: false,
    anthropic_key: false,
    google_key: false,
    grok_key: false,
  });

  useEffect(() => {
    async function loadKeyStatus() {
      setIsLoading(true);
      try {
        const status = await getKeyStatus();
        setKeyStatus(status);
      } catch (error) {
        console.error("Failed to load key status:", error);
        toast.error("Failed to load API key status");
      } finally {
        setIsLoading(false);
      }
    }

    loadKeyStatus();
  }, []);

  async function handleSaveKey(keyName: KeyName, keyValue: string) {
    const result = await saveApiKey(keyName, keyValue);
    if (result.success) {
      setKeyStatus((prev) => ({ ...prev, [keyName]: true }));
      toast.success("API key saved successfully");
    } else {
      toast.error(result.error || "Failed to save API key");
    }
  }

  async function handleDeleteKey(keyName: KeyName) {
    const result = await deleteApiKey(keyName);
    if (result.success) {
      setKeyStatus((prev) => ({ ...prev, [keyName]: false }));
      toast.success("API key deleted");
    } else {
      toast.error(result.error || "Failed to delete API key");
    }
  }

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
                API keys are encrypted before storage and only used server-side during
                generation requests. They are never logged, displayed, or sent to your browser.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="">
          <div className="flex gap-3">
            <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Keys cannot be viewed after saving
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                For security, saved API keys are never displayed or retrieved. If you need to change a key, delete it first and add a new one.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
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
        </CardHeader>
        <CardContent className="space-y-4">
          {providers.map((provider) => (
            <ProviderKeyCard
              key={provider.key}
              provider={provider}
              hasKey={keyStatus[provider.key]}
              onSave={(key) => handleSaveKey(provider.key, key)}
              onDelete={() => handleDeleteKey(provider.key)}
            />
          ))}
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
