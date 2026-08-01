import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface AnalyticsEvent {
  event_name: string;
  properties?: Record<string, unknown>;
  session_id: string;
  page_path?: string;
  referrer?: string;
  screen_width?: number;
  screen_height?: number;
}

export async function POST(request: NextRequest) {
  try {
    // User-scoped client is enough: insert goes through SECURITY DEFINER RPC
    // (migration 204) that forces user_id = auth.uid(). Does not require
    // SUPABASE_SERVICE_ROLE_KEY (avoids prod 42501 when that env is wrong).
    const supabase = await createClient();

    const body: AnalyticsEvent = await request.json();

    if (!body.event_name || !body.session_id) {
      return NextResponse.json(
        { error: "event_name and session_id are required" },
        { status: 400 }
      );
    }

    const sanitizedProperties = sanitizeProperties(body.properties || {});

    const { error } = await supabase.rpc(
      "insert_analytics_event",
      {
        p_event_name: body.event_name,
        p_session_id: body.session_id,
        p_properties: sanitizedProperties,
        p_page_path: body.page_path ?? null,
        p_referrer: body.referrer ?? null,
        p_user_agent: request.headers.get("user-agent"),
        p_screen_width: body.screen_width ?? null,
        p_screen_height: body.screen_height ?? null,
      } as never
    );

    if (error) {
      console.error("Analytics insert error:", error.code, error.message);
      // Don't expose internal errors — analytics must not break UX
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json({ ok: true });
  }
}

function sanitizeProperties(props: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  const allowedKeys = new Set([
    "mpa", "model", "style", "duration_ms", "statement_count", "mpa_count",
    "has_metrics", "method", "rank", "afsc", "type", "provider", "feature",
    "share_type", "is_own", "category", "period", "direction", "context",
    "error", "to_library",
    "count", "success", "enabled", "visible",
    "ratee_type", "is_complete", "source_mpa", "target_mpa", "source_type",
    "award_type", "reason", "save_type",
    "member_type",
    "statement_type", "is_favorite", "rating",
    "path",
  ]);

  for (const [key, value] of Object.entries(props)) {
    if (!allowedKeys.has(key)) continue;

    if (typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    } else if (typeof value === "string") {
      if (value.length <= 50 && /^[a-zA-Z0-9_\-.]+$/.test(value)) {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}
