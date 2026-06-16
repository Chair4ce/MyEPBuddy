"use client";

import { useVersionCheck } from "@/hooks/use-version-check";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";

interface UpdatePromptProps {
  /** Polling interval in milliseconds (default: 300000 = 5 minutes) */
  pollInterval?: number;
}

/**
 * Blocking update gate — when the user's cached bundle is stale, they must
 * refresh before continuing. No dismiss; only action is "Refresh now".
 */
export function UpdatePrompt({ pollInterval = 300000 }: UpdatePromptProps) {
  const { hasUpdate, latestVersion, refreshApp } = useVersionCheck({
    pollInterval,
    checkOnFocus: true,
    disabled: process.env.NODE_ENV === "development",
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    await refreshApp();
  }

  return (
    <AlertDialog open={hasUpdate}>
      <AlertDialogContent
        size="sm"
        className="z-[100]"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-6 text-primary" aria-hidden="true" />
          </div>
          <AlertDialogTitle className="text-center">
            Update required
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-center text-sm text-muted-foreground">
              <p>
                You&apos;re on an older version of EPBuddy
                {latestVersion?.version ? ` (v${latestVersion.version} is available)` : ""}.
                Refresh to get the latest fixes and keep working safely.
              </p>
              <p className="text-xs">
                Save any in-progress work in another tab if needed — this refresh
                reloads the app with the newest version.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="sm:justify-center">
          <Button
            className="w-full sm:w-auto min-w-[160px]"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            aria-label="Refresh to update the application"
          >
            {isRefreshing ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="size-4 mr-2" />
                Refresh now
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
