/**
 * API Usage Tracker
 *
 * Default-key users consume prepaid AI call credits (100 trial, then purchasable).
 * BYOK users (own API key) are unlimited and never consume credits.
 *
 * One billable action = one user-initiated click.
 */

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_APP_MODEL_ID } from "@/lib/constants";
import {
  computeDisplayTrialCredits,
  getSignupTrialCreditsConfig,
} from "@/lib/billing/signup-trial-credits";
import { isUsingDefaultKey, detectProvider } from "@/lib/llm-provider";
import type { TokenTrackingContext } from "@/lib/ai-models/token-usage";
import type { DecryptedApiKeys } from "@/app/actions/api-keys";

export const DEFAULT_KEY_MODEL = DEFAULT_APP_MODEL_ID;

export type BillableAction =
  | "generate"
  | "revise_selection"
  | "generate_war"
  | "generate_award"
  | "generate_decoration"
  | "generate_slot_statement"
  | "assess_epb"
  | "assess_accomplishment"
  | "assess_accomplishment_preview"
  | "parse_bulk_statements"
  | "adapt_sentence"
  | "synonyms"
  | "combine"
  | "combine_statements"
  | "convert_sentences"
  | "feedback_apply";

export interface UsageCheckResult {
  allowed: boolean;
  usingDefaultKey: boolean;
  effectiveModel: string;
  creditsRemaining?: number;
  creditsBalance?: number;
  lifetimeConsumed?: number;
  trialCredits?: number;
  rateLimited?: boolean;
  insufficientCredits?: boolean;
  /** Usage RPC failed — request must not proceed (fail closed). */
  serviceError?: boolean;
  /**
   * Token-usage tracking context to forward to getModelProvider so each LLM
   * call's token consumption is captured. Present only when the call is allowed.
   */
  tracking?: TokenTrackingContext;
}

export async function checkAndTrackUsage(
  userId: string,
  action: BillableAction,
  modelId: string,
  userKeys: Partial<DecryptedApiKeys> | null,
  idempotencyKey?: string | null,
): Promise<UsageCheckResult> {
  const usingDefault = isUsingDefaultKey(modelId, userKeys);
  const effectiveModel = usingDefault ? DEFAULT_KEY_MODEL : modelId;
  const provider = detectProvider(effectiveModel);
  const supabase = await createClient();

  const tracking: TokenTrackingContext = {
    userId,
    action,
    usingDefaultKey: usingDefault,
  };

  if (!usingDefault) {
    const { data: countAfter, error } = await (supabase.rpc as Function)(
      "check_and_record_usage",
      {
        p_user_id: userId,
        p_action_type: action,
        p_model_id: effectiveModel,
        p_provider: provider,
      },
    ) as { data: number | null; error: { message: string } | null };

    if (error) {
      console.error("[usage-tracker] BYOK RPC error:", error.message);
      return {
        allowed: false,
        usingDefaultKey: false,
        effectiveModel,
        serviceError: true,
      };
    }

    if (countAfter === -1) {
      return {
        allowed: false,
        usingDefaultKey: false,
        effectiveModel,
        rateLimited: true,
      };
    }

    return {
      allowed: true,
      usingDefaultKey: false,
      effectiveModel,
      tracking,
    };
  }

  const { data: balanceAfter, error } = await (supabase.rpc as Function)(
    "consume_credit",
    {
      p_user_id: userId,
      p_action_type: action,
      p_model_id: effectiveModel,
      p_provider: provider,
      p_idempotency_key: idempotencyKey ?? null,
    },
  ) as { data: number | null; error: { message: string } | null };

  if (error) {
    console.error("[usage-tracker] consume_credit error:", error.message);
    return {
      allowed: false,
      usingDefaultKey: true,
      effectiveModel,
      insufficientCredits: true,
      creditsRemaining: 0,
    };
  }

  const result = balanceAfter ?? -2;

  if (result === -1) {
    return {
      allowed: false,
      usingDefaultKey: true,
      effectiveModel,
      rateLimited: true,
    };
  }

  if (result === -2) {
    return {
      allowed: false,
      usingDefaultKey: true,
      effectiveModel,
      insufficientCredits: true,
      creditsRemaining: 0,
    };
  }

  return {
    allowed: true,
    usingDefaultKey: true,
    effectiveModel,
    creditsRemaining: result,
    creditsBalance: result,
    tracking,
  };
}

export async function getUsageStats(userId: string): Promise<{
  creditsRemaining: number;
  creditsBalance: number;
  lifetimeConsumed: number;
  lifetimePurchased: number;
  trialCredits: number;
  signupTrialCredits: number;
  trialGranted: boolean;
  preferCreditsFirst: boolean;
}> {
  const supabase = await createClient();
  const db = supabase as unknown as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query-builder chains are not generically typed here
    from: (table: string) => any;
  };

  const [config, creditsResult, trialTxnResult] = await Promise.all([
    getSignupTrialCreditsConfig(),
    db
      .from("user_credits")
      .select(
        "balance, lifetime_consumed, lifetime_purchased, trial_granted, prefer_credits_first",
      )
      .eq("user_id", userId)
      .maybeSingle() as Promise<{
      data: {
        balance: number;
        lifetime_consumed: number;
        lifetime_purchased: number;
        trial_granted: boolean;
        prefer_credits_first: boolean;
      } | null;
      error: { message: string } | null;
    }>,
    db
      .from("credit_transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("type", "trial")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle() as Promise<{
      data: { amount: number } | null;
      error: { message: string } | null;
    }>,
  ]);

  const data = creditsResult.data;
  const lifetimePurchased = data?.lifetime_purchased ?? 0;
  const trialCredits = computeDisplayTrialCredits({
    ledgerTrialAmount: trialTxnResult.data?.amount ?? null,
    lifetimePurchased,
    configDefault: config,
  });

  if (!data) {
    return {
      creditsRemaining: 0,
      creditsBalance: 0,
      lifetimeConsumed: 0,
      lifetimePurchased: 0,
      trialCredits,
      signupTrialCredits: config,
      trialGranted: false,
      preferCreditsFirst: true,
    };
  }

  return {
    creditsRemaining: data.balance,
    creditsBalance: data.balance,
    lifetimeConsumed: data.lifetime_consumed,
    lifetimePurchased,
    trialCredits,
    signupTrialCredits: config,
    trialGranted: data.trial_granted,
    preferCreditsFirst: data.prefer_credits_first ?? true,
  };
}
