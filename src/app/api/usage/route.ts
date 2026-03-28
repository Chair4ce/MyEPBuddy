import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usage-tracker";
import { getKeyStatus } from "@/app/actions/api-keys";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [stats, keyStatus] = await Promise.all([
    getUsageStats(user.id),
    getKeyStatus(),
  ]);

  const hasOwnKey =
    keyStatus.openai_key ||
    keyStatus.anthropic_key ||
    keyStatus.google_key ||
    keyStatus.grok_key;

  return NextResponse.json({ ...stats, hasOwnKey });
}
