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
import { Analytics } from "@/lib/analytics";
import { Loader2, Key, Shield, ExternalLink, Check, Trash2, ShieldAlert, FlaskConical, CircleCheck, CircleX } from "lucide-react";
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
  testApiKey,
  type KeyStatus,
  type KeyName,
} from "@/app/actions/api-keys";
import {
  getModelsForProviderKey,
  getProviderModelSummary,
  getUnlockedModels,
  type ProviderKeyName,
} from "@/lib/model-preferences";

interface Provider {
  key: ProviderKeyName;
  name: string;
  url: string;
}

const providers: Provider[] = [
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

/** Test result state for visual feedback */
type TestState = "idle" | "testing" | "valid" | "invalid";

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
  const providerModels = getModelsForProviderKey(provider.key);
  const modelSummary = getProviderModelSummary(provider.key);
  const [newKey, setNewKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [testError, setTestError] = useState<string | null>(null);

  // Reset test state when key input changes
  function handleKeyChange(value: string) {
    setNewKey(value);
    if (testState !== "idle") {
      setTestState("idle");
      setTestError(null);
    }
  }

  /** Test a raw key before saving */
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

  /** Test the already-saved key */
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
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-medium">{provider.name}</Label>
          <p className="text-xs text-muted-foreground">
            Unlocks: {modelSummary}
          </p>
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

      <ul className="text-xs text-muted-foreground space-y-1 pl-1">
        {providerModels.map((model) => (
          <li key={model.id} className="flex items-center gap-1.5">
            <Check className="size-3 shrink-0 text-muted-foreground/70" />
            <span>{model.name}</span>
          </li>
        ))}
      </ul>

      {hasKey ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-md px-3 py-2">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <Check className="size-4" />
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
          {/* Show test error message for saved keys */}
          {testState === "invalid" && testError && (
            <p className="text-xs text-destructive px-1">{testError}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
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
                  handleSave();
                }
              }}
            />
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
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </div>
          {/* Show test result message below the input */}
          {testState === "valid" && (
            <p className="text-xs text-green-600 dark:text-green-400 px-1 flex items-center gap-1">
              <CircleCheck className="size-3" />
              Key is valid and ready to use
            </p>
          )}
          {testState === "invalid" && testError && (
            <p className="text-xs text-destructive px-1 flex items-center gap-1">
              <CircleX className="size-3" />
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
      Analytics.apiKeyAdded(keyName);
      toast.success("API key saved successfully");
    } else {
      toast.error(result.error || "Failed to save API key");
    }
  }

  async function handleDeleteKey(keyName: KeyName) {
    const result = await deleteApiKey(keyName);
    if (result.success) {
      setKeyStatus((prev) => ({ ...prev, [keyName]: false }));
      Analytics.apiKeyRemoved(keyName);
      toast.success("API key deleted");
    } else {
      toast.error(result.error || "Failed to delete API key");
    }
  }

  const unlockedModels = getUnlockedModels(keyStatus);
  const hasAnyKey = Object.values(keyStatus).some(Boolean);

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
                generation requests. They are never logged, displayed, or sent to your browser. If you need to change a key, delete it first and add a new one.
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
          <CardTitle className="text-base">Available models</CardTitle>
          <CardDescription>
            {hasAnyKey
              ? "Models you can select right now based on your saved keys. Customize picker visibility in Model Settings."
              : "Add a provider key below to unlock premium models. The free default is always available."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {unlockedModels.map((model) => (
              <li
                key={model.id}
                className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{model.name}</p>
                  <p className="text-xs text-muted-foreground">{model.description}</p>
                </div>
                {"isAppDefault" in model && model.isAppDefault ? (
                  <span className="text-[11px] text-muted-foreground shrink-0">Free default</span>
                ) : (
                  <span className="text-[11px] text-green-600 dark:text-green-400 shrink-0">
                    Your key
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Manage which models appear in dropdowns on the{" "}
            <a href="/settings/models" className="text-primary hover:underline">
              AI Models
            </a>{" "}
            settings page. Refresh the catalog there when providers release new models.
          </p>
          <p>
            When you generate EPB statements, the app will check if you have an
            API key for the selected model&apos;s provider:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong className="text-foreground">With your key:</strong> Your
              key is used for any model from that provider in the model picker
              (Generate, Award, EPB, and Library workspace)
            </li>
            <li>
              <strong className="text-foreground">Without your key:</strong> The
              app&apos;s shared default model is used (limited free usage)
            </li>
          </ul>
          <p>
            Each provider key unlocks every model listed under that provider above.
            Pick your preferred model from the model selector on any generation screen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
