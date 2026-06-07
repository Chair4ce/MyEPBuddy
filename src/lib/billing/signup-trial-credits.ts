import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SIGNUP_TRIAL_CREDITS } from "@/lib/billing/constants";

/** App-wide signup trial grant (admin-configurable via epb_config). */
export async function getSignupTrialCreditsConfig(): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: number) => {
          maybeSingle: () => Promise<{
            data: { signup_trial_credits: number } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("epb_config")
    .select("signup_trial_credits")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data?.signup_trial_credits) {
    return DEFAULT_SIGNUP_TRIAL_CREDITS;
  }

  return data.signup_trial_credits;
}

/**
 * Display value for a user's signup trial grant.
 *
 * Pure helper so callers that already hold the user_credits row and the trial
 * ledger entry don't re-query. Trial-only users (never purchased) are shown the
 * smaller of their recorded grant and the current admin default, so lowering the
 * config visually caps legacy trial-only accounts without touching balances.
 */
export function computeDisplayTrialCredits(params: {
  ledgerTrialAmount: number | null;
  lifetimePurchased: number;
  configDefault: number;
}): number {
  const ledgerAmount = params.ledgerTrialAmount ?? params.configDefault;
  if (params.lifetimePurchased === 0) {
    return Math.min(ledgerAmount, params.configDefault);
  }
  return ledgerAmount;
}
