import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  scanForSensitiveData,
  redactSensitiveData,
} from "@/lib/sensitive-data-scanner";

/**
 * POST /api/scan-entry
 *
 * Post-save background scan for a single accomplishment.
 * If sensitive data is detected, auto-redacts the affected fields
 * and logs the event to the audit table.
 *
 * Body: { accomplishmentId: string }
 */
export async function POST(request: Request) {
  try {
    const { accomplishmentId } = (await request.json()) as {
      accomplishmentId?: string;
    };

    if (!accomplishmentId) {
      return NextResponse.json(
        { error: "accomplishmentId is required" },
        { status: 400 }
      );
    }

    // Authenticate the caller
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Fetch the accomplishment (RLS ensures the user can access it)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: entry, error: fetchError } = await (supabase as any)
      .from("accomplishments")
      .select("id, user_id, details, impact, metrics")
      .eq("id", accomplishmentId)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json(
        { error: "Accomplishment not found" },
        { status: 404 }
      );
    }

    // Scan text fields
    const matches = scanForSensitiveData({
      details: entry.details,
      impact: entry.impact ?? undefined,
      metrics: entry.metrics ?? undefined,
    });

    // Use service client for audit log + sensitive_data columns (RLS restricted)
    const service = await createServiceClient();

    if (matches.length > 0) {
      // Build redacted versions of each affected field
      const detailMatches = matches.filter((m) => m.field === "details");
      const impactMatches = matches.filter((m) => m.field === "impact");
      const metricsMatches = matches.filter((m) => m.field === "metrics");

      const redactedDetails =
        detailMatches.length > 0
          ? redactSensitiveData(entry.details, detailMatches)
          : entry.details;

      const redactedImpact =
        impactMatches.length > 0 && entry.impact
          ? redactSensitiveData(entry.impact, impactMatches)
          : entry.impact;

      const redactedMetrics =
        metricsMatches.length > 0 && entry.metrics
          ? redactSensitiveData(entry.metrics, metricsMatches)
          : entry.metrics;

      // Save original snippets for incident response (audit only)
      const originalSnippets: Record<string, string> = {};
      if (detailMatches.length > 0) originalSnippets.details = entry.details;
      if (impactMatches.length > 0 && entry.impact)
        originalSnippets.impact = entry.impact;
      if (metricsMatches.length > 0 && entry.metrics)
        originalSnippets.metrics = entry.metrics;

      // Update the entry with redacted text + scan metadata
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (service as any)
        .from("accomplishments")
        .update({
          details: redactedDetails,
          impact: redactedImpact,
          metrics: redactedMetrics,
          sensitive_data_scanned_at: new Date().toISOString(),
          sensitive_data_flags: matches.map((m) => ({
            type: m.type,
            category: m.category,
            severity: m.severity,
            label: m.label,
            field: m.field,
          })),
        })
        .eq("id", accomplishmentId);

      // Audit log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (service as any).from("sensitive_data_audit_log").insert({
        accomplishment_id: accomplishmentId,
        user_id: entry.user_id,
        action: "redacted",
        matches: matches.map((m) => ({
          type: m.type,
          category: m.category,
          severity: m.severity,
          label: m.label,
          field: m.field,
        })),
        original_snippets: originalSnippets,
      });

      return NextResponse.json({
        status: "redacted",
        matchCount: matches.length,
        fields: [
          ...(detailMatches.length > 0 ? ["details"] : []),
          ...(impactMatches.length > 0 ? ["impact"] : []),
          ...(metricsMatches.length > 0 ? ["metrics"] : []),
        ],
      });
    }

    // No matches — mark as scanned clean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any)
      .from("accomplishments")
      .update({
        sensitive_data_scanned_at: new Date().toISOString(),
        sensitive_data_flags: null,
      })
      .eq("id", accomplishmentId);

    return NextResponse.json({ status: "clean", matchCount: 0 });
  } catch (error) {
    console.error("Scan entry error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
