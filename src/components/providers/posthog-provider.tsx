"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPostHog, identifyUser, resetUser } from "@/lib/posthog";
import posthog from "posthog-js";
import { useUserStore } from "@/stores/user-store";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile } = useUserStore();

  // Initialize PostHog on mount
  useEffect(() => {
    initPostHog();
  }, []);

  // Track page views on route change
  useEffect(() => {
    if (pathname && posthog.__loaded) {
      let url = window.origin + pathname;
      if (searchParams?.toString()) {
        url = url + "?" + searchParams.toString();
      }
      posthog.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams]);

  // Identify user when profile is available
  useEffect(() => {
    if (profile?.id) {
      identifyUser(profile.id, {
        email: profile.email,
        rank: profile.rank,
        afsc: profile.afsc,
        unit: profile.unit,
        role: profile.role,
        created_at: profile.created_at,
      });
    }
  }, [profile]);

  return <>{children}</>;
}

// Hook for components that need to reset on logout
export function usePostHogReset() {
  return resetUser;
}
