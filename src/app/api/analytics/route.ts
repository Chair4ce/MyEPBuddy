import { createAdminClient, createClient } from "@/lib/supabase/server";
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
    const supabase = await createClient();
    
    // Get current user (may be null for anonymous events)
    const { data: { user } } = await supabase.auth.getUser();
    
    const body: AnalyticsEvent = await request.json();
    
    // Validate required fields
    if (!body.event_name || !body.session_id) {
      return NextResponse.json(
        { error: "event_name and session_id are required" },
        { status: 400 }
      );
    }
    
    // Sanitize properties - remove any potentially sensitive data patterns
    const sanitizedProperties = sanitizeProperties(body.properties || {});
    
    // Insert via service role — authenticated INSERT RLS is revoked (migration 202)
    const admin = createAdminClient();
    const { error } = await admin.from("analytics_events" as never).insert({
      user_id: user?.id || null,
      session_id: body.session_id,
      event_name: body.event_name,
      properties: sanitizedProperties,
      page_path: body.page_path,
      referrer: body.referrer,
      user_agent: request.headers.get("user-agent"),
      screen_width: body.screen_width,
      screen_height: body.screen_height,
    } as never);
    
    if (error) {
      console.error("Analytics insert error:", error);
      // Don't expose internal errors, but log them
      return NextResponse.json({ ok: true }); // Fail silently for analytics
    }
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Analytics API error:", error);
    // Analytics should never break the user experience
    return NextResponse.json({ ok: true });
  }
}

// Remove any values that look like they might contain user content
function sanitizeProperties(props: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  // Allowlist of safe property keys
  const allowedKeys = new Set([
    // Event metadata
    "mpa", "model", "style", "duration_ms", "statement_count", "mpa_count",
    "has_metrics", "method", "rank", "afsc", "type", "provider", "feature",
    "share_type", "is_own", "category", "period", "direction", "context",
    "error", "to_library",
    // Counts and booleans only
    "count", "success", "enabled", "visible",
    // EPB workflow
    "ratee_type", "is_complete", "source_mpa", "target_mpa", "source_type",
    // Award & Decoration
    "award_type", "reason", "save_type",
    // Team & Managed Accounts
    "member_type",
    // Library
    "statement_type", "is_favorite", "rating",
    // Page view path
    "path",
  ]);
  
  for (const [key, value] of Object.entries(props)) {
    // Only include allowed keys
    if (!allowedKeys.has(key)) continue;
    
    // Only include safe value types (no strings that could be user content)
    if (typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    } else if (typeof value === "string") {
      // Only short strings that look like enums/identifiers
      if (value.length <= 50 && /^[a-zA-Z0-9_\-\.]+$/.test(value)) {
        sanitized[key] = value;
      }
    }
  }
  
  return sanitized;
}
