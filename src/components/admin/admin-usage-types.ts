import type { DefaultKeyUsageData } from "@/components/admin/default-key-usage-dashboard";

export interface UserCreditAnalyticsData {
  since: string;
  days: number;
  trial_credits: number;
  population: {
    total_users: number;
    with_credits_row: number;
    active_in_window: number;
    default_key_active_in_window: number;
  };
  conversion: {
    purchased_credits: number;
    byok_users: number;
    byok_only: number;
    byok_and_purchased: number;
    trial_only_active: number;
    credits_first_byok: number;
    dormant: number;
    exhausted_no_convert: number;
    consumed_any: number;
    rates: {
      purchase_rate_pct: number;
      byok_rate_pct: number;
      any_convert_pct: number;
      exhausted_no_convert_pct: number;
    };
  };
  trial_burn: {
    avg_trial_consumed: number;
    avg_calls_per_week: number;
    avg_days_to_exhaust_trial: number;
    distribution: { bucket: string; users: number }[];
    by_week: { week_start: string; calls: number; unique_users: number }[];
    by_day: { day: string; calls: number; unique_users: number }[];
  };
  byok_models: {
    by_model: { model_id: string; calls: number; unique_users: number }[];
    by_category: { category: string; calls: number; unique_users: number }[];
    by_model_and_category: {
      model_id: string;
      category: string;
      calls: number;
    }[];
  };
  trial_users: {
    user_id: string;
    email: string | null;
    full_name: string | null;
    signed_up_at: string;
    trial_consumed: number;
    balance: number;
    lifetime_purchased: number;
    lifetime_consumed: number;
    has_byok: boolean;
    calls_in_window: number;
    calls_per_week: number;
    segment: string;
  }[];
}

export interface AdminUsagePageData {
  days: number;
  credits: UserCreditAnalyticsData;
  defaultKey: DefaultKeyUsageData;
}
