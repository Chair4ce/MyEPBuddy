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

/** Trial grant recorded for this user at signup (immutable ledger row). */
export async function getUserTrialGrantAmount(userId: string): Promise<number> {
  const configDefault = await getSignupTrialCreditsConfig();
  const supabase = await createClient();

  const [creditsResult, txnResult] = await Promise.all([
    (supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { lifetime_purchased: number } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    })
      .from("user_credits")
      .select("lifetime_purchased")
      .eq("user_id", userId)
      .maybeSingle(),
    (supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col2: string, val2: string) => {
              order: (col3: string, opts: { ascending: boolean }) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{
                    data: { amount: number } | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    })
      .from("credit_transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("type", "trial")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const ledgerAmount = txnResult.data?.amount ?? configDefault;

  if ((creditsResult.data?.lifetime_purchased ?? 0) === 0) {
    return Math.min(ledgerAmount, configDefault);
  }

  return ledgerAmount;
}
