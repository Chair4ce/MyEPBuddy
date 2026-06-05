"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
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
import { testApiKey } from "@/app/actions/api-keys";
import type { ProviderKeyName } from "@/lib/model-preferences";
import {
  Check,
  CircleCheck,
  CircleX,
  ExternalLink,
  FlaskConical,
  Loader2,
  Trash2,
} from "lucide-react";

export interface ProviderKeyConfig {
  key: ProviderKeyName;
  name: string;
  url: string;
}

type TestState = "idle" | "testing" | "valid" | "invalid";

interface ProviderKeySectionProps {
  provider: ProviderKeyConfig;
  hasKey: boolean;
  onSave: (key: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function ProviderKeySection({
  provider,
  hasKey,
  onSave,
  onDelete,
}: ProviderKeySectionProps) {
  const [newKey, setNewKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testError, setTestError] = useState<string | null>(null);

  function handleKeyChange(value: string) {
    setNewKey(value);
    if (testState !== "idle") {
      setTestState("idle");
      setTestError(null);
    }
  }

  async function handleTestBeforeSave() {
    if (!newKey.trim()) {
      toast.error("Please enter an API key first");
      return;
    }
    setTestState("testing");
    setTestError(null);
    try {
      const result = await testApiKey(provider.key, newKey.trim());
      if (result.valid) {
        setTestState("valid");
        toast.success(`${provider.name} key is valid`);
      } else {
        setTestState("invalid");
        setTestError(result.error || "Key validation failed");
        toast.error(result.error || "Key validation failed");
      }
    } catch {
      setTestState("invalid");
      setTestError("Failed to test key");
      toast.error("Failed to test key");
    }
  }

  async function handleTestSavedKey() {
    setTestState("testing");
    setTestError(null);
    try {
      const result = await testApiKey(provider.key);
      if (result.valid) {
        setTestState("valid");
        toast.success(`${provider.name} key is valid`);
      } else {
        setTestState("invalid");
        setTestError(result.error || "Key validation failed");
        toast.error(result.error || "Key validation failed");
      }
    } catch {
      setTestState("invalid");
      setTestError("Failed to test key");
      toast.error("Failed to test key");
    }
  }

  async function handleSave() {
    if (!newKey.trim()) {
      toast.error("Please enter an API key");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(newKey.trim());
      setNewKey("");
      setTestState("idle");
      setTestError(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await onDelete();
      setTestState("idle");
      setTestError(null);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium">API key</Label>
        <a
          href={provider.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
        >
          Get API key
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>

      {hasKey ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-md px-3 py-2">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <Check className="size-4" aria-hidden="true" />
              <span className="text-sm font-medium">API key saved</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTestSavedKey}
                disabled={testState === "testing"}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Test ${provider.name} API key`}
              >
                {testState === "testing" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : testState === "valid" ? (
                  <CircleCheck className="size-4 text-green-600 dark:text-green-400" />
                ) : testState === "invalid" ? (
                  <CircleX className="size-4 text-destructive" />
                ) : (
                  <FlaskConical className="size-4" />
                )}
                <span className="ml-1 text-xs">
                  {testState === "testing"
                    ? "Testing..."
                    : testState === "valid"
                      ? "Valid"
                      : testState === "invalid"
                        ? "Invalid"
                        : "Test"}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                aria-label={`Delete ${provider.name} API key`}
              >
                {isDeleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </div>
          </div>
          {testState === "invalid" && testError && (
            <p className="text-xs text-destructive px-1">{testError}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              value={newKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder={`Enter your ${provider.name} API key`}
              className="font-mono text-sm"
              aria-label={`${provider.name} API key`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
            />
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={handleTestBeforeSave}
                disabled={testState === "testing" || !newKey.trim()}
                aria-label={`Test ${provider.name} API key before saving`}
              >
                {testState === "testing" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : testState === "valid" ? (
                  <CircleCheck className="size-4 text-green-600 dark:text-green-400" />
                ) : testState === "invalid" ? (
                  <CircleX className="size-4 text-destructive" />
                ) : (
                  <FlaskConical className="size-4" />
                )}
                <span className="ml-1">Test</span>
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !newKey.trim()}>
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
          {testState === "valid" && (
            <p className="text-xs text-green-600 dark:text-green-400 px-1 flex items-center gap-1">
              <CircleCheck className="size-3" aria-hidden="true" />
              Key is valid and ready to use
            </p>
          )}
          {testState === "invalid" && testError && (
            <p className="text-xs text-destructive px-1 flex items-center gap-1">
              <CircleX className="size-3" aria-hidden="true" />
              {testError}
            </p>
          )}
        </div>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {provider.name} API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your {provider.name} API key. You&apos;ll need to add a
              new key to use {provider.name} models again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Delete Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const PROVIDER_KEY_CONFIGS: ProviderKeyConfig[] = [
  {
    key: "openai_key",
    name: "OpenAI",
    url: "https://platform.openai.com/api-keys",
  },
  {
    key: "anthropic_key",
    name: "Anthropic",
    url: "https://console.anthropic.com/settings/keys",
  },
  {
    key: "google_key",
    name: "Google AI",
    url: "https://aistudio.google.com/app/apikey",
  },
  {
    key: "grok_key",
    name: "xAI",
    url: "https://x.ai/api",
  },
];
