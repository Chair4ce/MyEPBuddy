import posthog from "posthog-js";

// PostHog initialization - call once on app load
export function initPostHog() {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return; // Already initialized

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!key) {
    console.warn("PostHog key not configured - analytics disabled");
    return;
  }

  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only", // Only create profiles for identified users
    capture_pageview: true, // Auto-capture page views
    capture_pageleave: true, // Track when users leave pages
    autocapture: true, // Auto-capture clicks, form submissions, etc.
    persistence: "localStorage",
    disable_session_recording: false, // Enable session replay
  });
}

// Identify user after login
export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  posthog.identify(userId, traits);
}

// Reset on logout
export function resetUser() {
  if (typeof window === "undefined") return;
  posthog.reset();
}

// Custom event tracking
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  posthog.capture(event, properties);
}

// ============================================
// MYEPBUDDY-SPECIFIC EVENTS
// ============================================

// Onboarding & Activation
export const Analytics = {
  // First-run events
  signUp: (method: "email" | "google" | "phone") => 
    trackEvent("user_signed_up", { method }),
  
  profileCompleted: (rank: string, afsc: string) => 
    trackEvent("profile_completed", { rank, afsc }),

  // Core workflow
  accomplishmentCreated: (mpa: string, hasMetrics: boolean) => 
    trackEvent("accomplishment_created", { mpa, has_metrics: hasMetrics }),
  
  accomplishmentEdited: (mpa: string) => 
    trackEvent("accomplishment_edited", { mpa }),

  // Statement generation - THE KEY FUNNEL
  generateStarted: (model: string, style: string, mpaCount: number) => 
    trackEvent("generate_started", { model, style, mpa_count: mpaCount }),
  
  generateCompleted: (model: string, durationMs: number, statementCount: number) => 
    trackEvent("generate_completed", { model, duration_ms: durationMs, statement_count: statementCount }),
  
  generateFailed: (model: string, error: string) => 
    trackEvent("generate_failed", { model, error }),

  // Statement actions
  statementCopied: (mpa: string) => 
    trackEvent("statement_copied", { mpa }),
  
  statementSaved: (mpa: string, toLibrary: boolean) => 
    trackEvent("statement_saved", { mpa, to_library: toLibrary }),
  
  statementShared: (shareType: "team" | "chain" | "community") => 
    trackEvent("statement_shared", { share_type: shareType }),

  // EPB workflow
  epbOpened: (isOwnEpb: boolean) => 
    trackEvent("epb_opened", { is_own: isOwnEpb }),
  
  epbArchived: () => 
    trackEvent("epb_archived"),
  
  epbCollaborationStarted: () => 
    trackEvent("epb_collaboration_started"),

  // Team features
  teamMemberAdded: (type: "account" | "managed") => 
    trackEvent("team_member_added", { type }),
  
  supervisionRequested: (direction: "up" | "down") => 
    trackEvent("supervision_requested", { direction }),

  // Award packages
  awardCreated: (category: string, period: string) => 
    trackEvent("award_created", { category, period }),

  // API Keys - important for BYOK model
  apiKeyAdded: (provider: string) => 
    trackEvent("api_key_added", { provider }),
  
  apiKeyRemoved: (provider: string) => 
    trackEvent("api_key_removed", { provider }),

  // Feature discovery
  featureViewed: (feature: string) => 
    trackEvent("feature_viewed", { feature }),

  // Errors & friction
  errorEncountered: (context: string, error: string) => 
    trackEvent("error_encountered", { context, error }),
};

export default posthog;
