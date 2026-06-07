export interface UsageTotals {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
  reasoning_tokens?: number;
  estimated_cost_usd: number;
}

export interface DayCostRow {
  day: string;
  calls: number;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost_usd: number;
}

export interface DefaultKeyUsageData {
  since: string;
  days: number;
  totals: UsageTotals;
  all_time: Pick<
    UsageTotals,
    "calls" | "input_tokens" | "output_tokens" | "estimated_cost_usd"
  >;
  by_model: {
    model_id: string;
    calls: number;
    estimated_cost_usd: number;
  }[];
  by_action: {
    action_type: string;
    calls: number;
    estimated_cost_usd: number;
  }[];
  by_day: DayCostRow[];
  top_users: {
    user_id: string;
    email: string | null;
    full_name: string | null;
    calls: number;
    estimated_cost_usd: number;
  }[];
}

export interface UserCreditAnalyticsData {
  since: string;
  days: number;
  trial_credits: number;
  population: {
    total_users: number;
    default_key_active_in_window: number;
  };
  conversion: {
    byok_users: number;
    purchased_credits: number;
  };
  trial_burn: {
    by_week: { week_start: string; calls: number; unique_users: number }[];
    by_day: { day: string; calls: number; unique_users: number }[];
  };
  byok_models: {
    by_model: { model_id: string; calls: number; unique_users: number }[];
  };
}

export interface AdminUsagePageData {
  days: number;
  credits: UserCreditAnalyticsData;
  defaultKey: DefaultKeyUsageData;
}
