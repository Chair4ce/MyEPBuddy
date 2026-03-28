import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  scanForSensitiveData,
  redactSensitiveData,
  type SensitiveMatch,
} from "@/lib/sensitive-data-scanner";

export const maxDuration = 120;

const BATCH_SIZE = 50;

interface BatchResult {
  scanned: number;
  redacted: number;
  clean: number;
  errors: number;
}

/**
 * POST /api/scan-entries-batch
 *
 * Batch-scan the authenticated user's accomplishments that have never been
 * scanned (sensitive_data_scanned_at IS NULL). Processes up to BATCH_SIZE
 * entries per invocation to stay within serverless time limits.
 *
 * Body (optional): { limit?: number }
 *
 * Call repeatedly until result.scanned < limit to process all entries.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(body.limit ?? BATCH_SIZE, BATCH_SIZE);

    // Service client for writing scan metadata + audit log (restricted columns)
    const service = await createServiceClient();

    // Use the user-scoped client for reads — RLS ensures only their own data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: entries, error: fetchError } = await (supabase as any)
      .from("accomplishments")
      .select("id, user_id, details, impact, metrics")
      .is("sensitive_data_scanned_at", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error("Batch scan fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch entries" },
        { status: 500 }
      );
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({
        status: "complete",
        message: "No un-scanned entries remaining",
        result: { scanned: 0, redacted: 0, clean: 0, errors: 0 },
      });
    }

    const result: BatchResult = { scanned: 0, redacted: 0, clean: 0, errors: 0 };

    for (const entry of entries) {
      try {
        const matches = scanForSensitiveData({
          details: entry.details,
          impact: entry.impact ?? undefined,
          metrics: entry.metrics ?? undefined,
        });

        if (matches.length > 0) {
          // Redact
          const detailMatches = matches.filter((m: SensitiveMatch) => m.field === "details");
          const impactMatches = matches.filter((m: SensitiveMatch) => m.field === "impact");
          const metricsMatches = matches.filter((m: SensitiveMatch) => m.field === "metrics");

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

          // Save originals for audit
          const originalSnippets: Record<string, string> = {};
          if (detailMatches.length > 0) originalSnippets.details = entry.details;
          if (impactMatches.length > 0 && entry.impact)
            originalSnippets.impact = entry.impact;
          if (metricsMatches.length > 0 && entry.metrics)
            originalSnippets.metrics = entry.metrics;

          // Update entry
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (service as any)
            .from("accomplishments")
            .update({
              details: redactedDetails,
              impact: redactedImpact,
              metrics: redactedMetrics,
              sensitive_data_scanned_at: new Date().toISOString(),
              sensitive_data_flags: matches.map((m: SensitiveMatch) => ({
                type: m.type,
                category: m.category,
                severity: m.severity,
                label: m.label,
                field: m.field,
              })),
            })
            .eq("id", entry.id);

          // Audit log
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (service as any).from("sensitive_data_audit_log").insert({
            accomplishment_id: entry.id,
            user_id: entry.user_id,
            action: "redacted",
            matches: matches.map((m: SensitiveMatch) => ({
              type: m.type,
              category: m.category,
              severity: m.severity,
              label: m.label,
              field: m.field,
            })),
            original_snippets: originalSnippets,
          });

          result.redacted++;
        } else {
          // Mark as scanned clean
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (service as any)
            .from("accomplishments")
            .update({
              sensitive_data_scanned_at: new Date().toISOString(),
              sensitive_data_flags: null,
            })
            .eq("id", entry.id);

          result.clean++;
        }

        result.scanned++;
      } catch (err) {
        console.error(`Batch scan error for entry ${entry.id}:`, err);
        result.errors++;
      }
    }

    return NextResponse.json({
      status: result.scanned < limit ? "complete" : "more_remaining",
      result,
    });
  } catch (error) {
    console.error("Batch scan error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
