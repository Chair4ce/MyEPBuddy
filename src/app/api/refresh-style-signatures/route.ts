import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { refreshUserSignatures } from "@/lib/style-signatures";

export const maxDuration = 60;

const COOLDOWN_MINUTES = 5;

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Manual refresh cooldown — style signatures do not consume AI call credits.
    const cooldownCutoff = new Date(
      Date.now() - COOLDOWN_MINUTES * 60 * 1000,
    ).toISOString();

    const { count } = await supabase
      .from("api_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action_type", "refresh_style_signatures")
      .gte("created_at", cooldownCutoff);

    if (count && count > 0) {
      return NextResponse.json(
        {
          error: `Style signatures can only be refreshed once every ${COOLDOWN_MINUTES} minutes.`,
        },
        { status: 429 },
      );
    }

    const { generated, quotaExhausted } = await refreshUserSignatures(user.id);

    // Record manual refresh for cooldown tracking only (not billable).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("api_usage").insert({
      user_id: user.id,
      action_type: "refresh_style_signatures",
      used_default_key: false,
      model_id: null,
      provider: null,
    });

    return NextResponse.json({
      success: true,
      signaturesGenerated: generated,
      quotaExhausted,
    });
  } catch (error) {
    console.error("[refresh-style-signatures] Error:", error);
    return NextResponse.json(
      { error: "Failed to refresh style signatures" },
      { status: 500 },
    );
  }
}
