"use client";

import { useVersionCheck } from "@/hooks/use-version-check";
import { Button } from "@/components/ui/button";
import { RefreshCw, X, Sparkles } from "lucide-react";

interface UpdatePromptProps {
  /** Polling interval in milliseconds (default: 300000 = 5 minutes) */
  pollInterval?: number;
}

export function UpdatePrompt({ pollInterval = 300000 }: UpdatePromptProps) {
  const { hasUpdate, latestVersion, refreshApp, dismissUpdate } = useVersionCheck({
    pollInterval,
    checkOnFocus: true,
    // Disable in development mode
    disabled: process.env.NODE_ENV === "development",
  });

  if (!hasUpdate) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 animate-slide-down"
    >
      <div className="bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 hidden sm:block">
                <Sparkles className="size-4" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium truncate">
                <span className="hidden sm:inline">A new version is available!</span>
                <span className="sm:hidden">Update available!</span>
                {latestVersion?.version && (
                  <span className="ml-1 opacity-80 hidden md:inline">
                    (v{latestVersion.version})
                  </span>
                )}
              </p>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="secondary"
                onClick={refreshApp}
                className="h-7 px-3 text-xs font-medium bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                aria-label="Refresh to update the application"
              >
                <RefreshCw className="size-3 mr-1.5" aria-hidden="true" />
                <span className="hidden xs:inline">Refresh</span>
                <span className="xs:hidden">Update</span>
              </Button>
              
              <Button
                size="sm"
                variant="ghost"
                onClick={dismissUpdate}
                className="h-7 w-7 p-0 hover:bg-primary-foreground/20"
                aria-label="Dismiss update notification"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

