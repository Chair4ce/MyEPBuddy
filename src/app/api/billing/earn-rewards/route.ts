import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getEarnRewardsSummary } from "@/lib/billing/earn-rewards";
import { getKeyStatus } from "@/app/actions/api-keys";
import { EARN_REWARD_RULES } from "@/lib/billing/reward-constants";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [keyStatus, summary] = await Promise.all([
    getKeyStatus(),
    getEarnRewardsSummary(),
  ]);

  const hasOwnKey =
    keyStatus.openai_key ||
    keyStatus.anthropic_key ||
    keyStatus.google_key ||
    keyStatus.grok_key;

  return NextResponse.json({
    eligible: !hasOwnKey,
    hasOwnKey,
    summary,
    rules: EARN_REWARD_RULES,
  });
}
