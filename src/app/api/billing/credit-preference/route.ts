import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Toggles the caller's "use free credits first" preference.
 * Persists via a SECURITY DEFINER RPC that only updates this one column for the
 * authenticated user, so we never expose a broad UPDATE policy on user_credits.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let preferCreditsFirst: boolean;
  try {
    const body = await request.json();
    if (typeof body?.preferCreditsFirst !== "boolean") {
      return NextResponse.json(
        { error: "preferCreditsFirst (boolean) is required" },
        { status: 400 },
      );
    }
    preferCreditsFirst = body.preferCreditsFirst;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { error } = (await (supabase.rpc as Function)(
    "set_credits_first_preference",
    { p_prefer: preferCreditsFirst },
  )) as { error: { message: string } | null };

  if (error) {
    console.error("[credit-preference] RPC error:", error.message);
    return NextResponse.json(
      { error: "Unable to update preference" },
      { status: 500 },
    );
  }

  return NextResponse.json({ preferCreditsFirst });
}
