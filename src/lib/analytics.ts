/**
 * Self-hosted analytics client for MyEPBuddy
 *
 * Dual-destination tracking:
 *  1. Supabase (analytics_events table) — full SQL access for deep custom queries
 *  2. Vercel Web Analytics (optional) — built-in graphical dashboard & custom events
 *
 * Vercel custom events can be toggled via the NEXT_PUBLIC_VERCEL_CUSTOM_EVENTS
 * environment variable. Set to "true" to enable, anything else (or unset) to
 * disable. This controls only custom events — Vercel page view tracking via the
 * <Analytics /> component in layout.tsx is independent and always active.
 *
 * At $0.00003/event on the Pro plan, disabling this avoids unexpected charges
 * while keeping all data flowing into our Supabase analytics_events table.
 */

import { track as vercelTrack } from "@vercel/analytics";

const VERCEL_CUSTOM_EVENTS_ENABLED =
  process.env.NEXT_PUBLIC_VERCEL_CUSTOM_EVENTS?.toLowerCase() === "true";

// Generate a session ID that persists for the browser session
function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  
  let sessionId = sessionStorage.getItem("analytics_session_id");
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem("analytics_session_id", sessionId);
  }
  return sessionId;
}

// Track an event — sends to both Supabase and Vercel Analytics
async function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  // ── 1. Vercel Web Analytics (custom events) ──
  // Gated by NEXT_PUBLIC_VERCEL_CUSTOM_EVENTS env var to control costs.
  // Skip $pageview — the <Analytics /> component already tracks page views.
  if (VERCEL_CUSTOM_EVENTS_ENABLED && eventName !== "$pageview") {
    try {
      // Vercel track() accepts string/number/boolean/null values only (no nested objects)
      // Our properties already conform to this via the server-side allowlist
      vercelTrack(eventName, properties as Record<string, string | number | boolean | null>);
    } catch {
      // Vercel analytics should never break the app
    }
  }

  // ── 2. Supabase analytics_events table ──
  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: eventName,
        properties: properties || {},
        session_id: getSessionId(),
        page_path: window.location.pathname,
        referrer: document.referrer || null,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
      }),
      // Don't wait for response - fire and forget
      keepalive: true,
    });
  } catch {
    // Analytics should never break the app
  }
}

// Track page view
export function trackPageView(path?: string) {
  trackEvent("$pageview", { path: path || window.location.pathname });
}

// ============================================
// MYEPBUDDY-SPECIFIC EVENTS
// ============================================

export const Analytics = {
  // ── Auth & Onboarding ──────────────────────────
  signUp: (method: "email" | "google" | "phone") => 
    trackEvent("user_signed_up", { method }),
  
  login: (method: "email" | "google" | "phone") =>
    trackEvent("user_logged_in", { method }),

  profileCompleted: (rank: string, afsc: string) => 
    trackEvent("profile_completed", { rank, afsc }),

  passwordResetRequested: () =>
    trackEvent("password_reset_requested"),

  passwordResetCompleted: () =>
    trackEvent("password_reset_completed"),

  // ── Accomplishments (Entries) ──────────────────
  accomplishmentCreated: (mpa: string, hasMetrics: boolean) => 
    trackEvent("accomplishment_created", { mpa, has_metrics: hasMetrics }),
  
  accomplishmentEdited: (mpa: string) => 
    trackEvent("accomplishment_edited", { mpa }),

  accomplishmentDeleted: (mpa: string) =>
    trackEvent("accomplishment_deleted", { mpa }),

  // ── EPB Shell Workflow ─────────────────────────
  epbShellCreated: (rateeType: string) =>
    trackEvent("epb_shell_created", { ratee_type: rateeType }),

  epbOpened: (isOwnEpb: boolean) => 
    trackEvent("epb_opened", { is_own: isOwnEpb }),
  
  epbArchived: (statementsSaved: number) => 
    trackEvent("epb_archived", { count: statementsSaved }),

  epbCollaborationStarted: () => 
    trackEvent("epb_collaboration_started"),

  epbCollaborationJoined: (joinMethod: string) =>
    trackEvent("epb_collaboration_joined", { method: joinMethod }),

  epbCollaborationEnded: () =>
    trackEvent("epb_collaboration_ended"),

  epbShared: () =>
    trackEvent("epb_shared"),

  epbShareRemoved: () =>
    trackEvent("epb_share_removed"),

  epbAssessmentStarted: () =>
    trackEvent("epb_assessment_started"),

  // ── Statement Generation ───────────────────────
  generateStarted: (model: string, style: string, mpaCount: number) => 
    trackEvent("generate_started", { model, style, mpa_count: mpaCount }),
  
  generateCompleted: (model: string, durationMs: number, statementCount: number) => 
    trackEvent("generate_completed", { model, duration_ms: durationMs, statement_count: statementCount }),
  
  generateFailed: (model: string, error: string) => 
    trackEvent("generate_failed", { model, error: error.slice(0, 50) }),

  // ── Statement Actions ──────────────────────────
  statementSourceSelected: (mpa: string, sourceType: string) =>
    trackEvent("statement_source_selected", { mpa, source_type: sourceType }),

  statementGenerated: (mpa: string, sourceType: string) =>
    trackEvent("statement_generated_used", { mpa, source_type: sourceType }),

  statementRevisionStarted: (mpa: string) =>
    trackEvent("statement_revision_started", { mpa }),

  statementRevisionApplied: (mpa: string) =>
    trackEvent("statement_revision_applied", { mpa }),

  statementEdited: (mpa: string) =>
    trackEvent("statement_edited", { mpa }),

  statementCopied: (mpa: string) => 
    trackEvent("statement_copied", { mpa }),
  
  statementSaved: (mpa: string, toLibrary: boolean) => 
    trackEvent("statement_saved", { mpa, to_library: toLibrary }),

  statementCompletionToggled: (mpa: string, isComplete: boolean) =>
    trackEvent("statement_completion_toggled", { mpa, is_complete: isComplete }),

  statementSnapshotCreated: (mpa: string) =>
    trackEvent("statement_snapshot_created", { mpa }),

  statementSnapshotRestored: (mpa: string) =>
    trackEvent("statement_snapshot_restored", { mpa }),

  statementReset: (mpa: string) =>
    trackEvent("statement_reset", { mpa }),

  sentenceReplaced: (sourceMpa: string, targetMpa: string) =>
    trackEvent("sentence_replaced", { source_mpa: sourceMpa, target_mpa: targetMpa }),

  sentenceSwapped: (sourceMpa: string, targetMpa: string) =>
    trackEvent("sentence_swapped", { source_mpa: sourceMpa, target_mpa: targetMpa }),

  // ── Statement Sharing ──────────────────────────
  statementShared: (shareType: "team" | "community" | "user") => 
    trackEvent("statement_shared", { share_type: shareType }),

  statementBulkShared: (shareType: string, count: number) =>
    trackEvent("statement_bulk_shared", { share_type: shareType, count }),

  sharedStatementCopied: (sourceType: string) =>
    trackEvent("shared_statement_copied", { source_type: sourceType }),

  // ── Library ────────────────────────────────────
  libraryStatementAdded: (statementType: string, mpa: string) =>
    trackEvent("library_statement_added", { statement_type: statementType, mpa }),

  libraryStatementEdited: (statementType: string) =>
    trackEvent("library_statement_edited", { statement_type: statementType }),

  libraryStatementDeleted: (statementType: string) =>
    trackEvent("library_statement_deleted", { statement_type: statementType }),

  libraryFavoriteToggled: (isFavorite: boolean) =>
    trackEvent("library_favorite_toggled", { is_favorite: isFavorite }),

  communityStatementRated: (rating: number) =>
    trackEvent("community_statement_rated", { rating }),

  // ── Award Packages ─────────────────────────────
  awardCreated: (category: string, period: string) => 
    trackEvent("award_created", { category, period }),

  awardSaved: (saveType: string) =>
    trackEvent("award_saved", { save_type: saveType }),

  awardDeleted: () =>
    trackEvent("award_deleted"),

  awardShared: () =>
    trackEvent("award_shared"),

  awardShareRemoved: () =>
    trackEvent("award_share_removed"),

  awardPreviewCopied: () =>
    trackEvent("award_preview_copied"),

  awardGenerated: (category: string) =>
    trackEvent("award_generated", { category }),

  // ── Decoration ─────────────────────────────────
  decorationCreated: (awardType: string, reason: string) =>
    trackEvent("decoration_created", { award_type: awardType, reason }),

  decorationSaved: (saveType: string) =>
    trackEvent("decoration_saved", { save_type: saveType }),

  decorationDeleted: () =>
    trackEvent("decoration_deleted"),

  decorationShared: () =>
    trackEvent("decoration_shared"),

  decorationShareRemoved: () =>
    trackEvent("decoration_share_removed"),

  decorationCitationGenerated: () =>
    trackEvent("decoration_citation_generated"),

  // ── Team Features ──────────────────────────────
  teamMemberAdded: (type: "account" | "managed") => 
    trackEvent("team_member_added", { type }),

  teamMemberRemoved: (memberType: string) =>
    trackEvent("team_member_removed", { member_type: memberType }),
  
  supervisionRequested: (direction: "up" | "down") => 
    trackEvent("supervision_requested", { direction }),

  supervisionRequestAccepted: () =>
    trackEvent("supervision_request_accepted"),

  supervisionRequestDeclined: () =>
    trackEvent("supervision_request_declined"),

  // ── Managed Accounts ───────────────────────────
  managedMemberAdded: () =>
    trackEvent("managed_member_added"),

  managedAccountDataSynced: () =>
    trackEvent("managed_account_data_synced"),

  managedAccountSupervisorAccepted: () =>
    trackEvent("managed_account_supervisor_accepted"),

  managedAccountLinkDismissed: () =>
    trackEvent("managed_account_link_dismissed"),

  managedAccountLinkCompleted: () =>
    trackEvent("managed_account_link_completed"),

  // ── API Keys ───────────────────────────────────
  apiKeyAdded: (provider: string) => 
    trackEvent("api_key_added", { provider }),
  
  apiKeyRemoved: (provider: string) => 
    trackEvent("api_key_removed", { provider }),

  // ── Settings ───────────────────────────────────
  profileUpdated: () =>
    trackEvent("profile_updated"),

  avatarUploaded: () =>
    trackEvent("avatar_uploaded"),

  avatarRemoved: () =>
    trackEvent("avatar_removed"),

  accountLinked: (provider: string) =>
    trackEvent("account_linked", { provider }),

  accountUnlinked: (provider: string) =>
    trackEvent("account_unlinked", { provider }),

  // ── Feature Discovery & Errors ─────────────────
  featureViewed: (feature: string) => 
    trackEvent("feature_viewed", { feature }),

  errorEncountered: (context: string) => 
    trackEvent("error_encountered", { context }),
};
