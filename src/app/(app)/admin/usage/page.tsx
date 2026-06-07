import { createClient } from "@/lib/supabase/server";
import { AdminUsageDashboard } from "@/components/admin/admin-usage-dashboard";
import type {
  AdminUsagePageData,
  DefaultKeyUsageData,
  UserCreditAnalyticsData,
} from "@/components/admin/admin-usage-types";

export const dynamic = "force-dynamic";

const ALLOWED_DAYS = [7, 30, 90, 365] as const;
const DEFAULT_DAYS = 30;

function resolveDays(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  return (ALLOWED_DAYS as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_DAYS;
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const supabase = await createClient();
  const days = resolveDays((await searchParams).days);

  const [defaultKeyResult, creditsResult] = await Promise.all([
    (supabase.rpc as Function)("admin_default_key_token_usage", {
      p_days: days,
    }) as Promise<{
      data: DefaultKeyUsageData | null;
      error: { message: string } | null;
    }>,
    (supabase.rpc as Function)("admin_user_credit_analytics", {
      p_days: days,
    }) as Promise<{
      data: UserCreditAnalyticsData | null;
      error: { message: string } | null;
    }>,
  ]);

  if (defaultKeyResult.error || creditsResult.error || !defaultKeyResult.data || !creditsResult.data) {
    const message =
      defaultKeyResult.error?.message ??
      creditsResult.error?.message ??
      "Unable to load usage data.";

    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Usage Analytics</h1>
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
        <p className="text-sm text-muted-foreground">
          If this is a new migration, run{" "}
          <code className="text-xs">supabase db push --local</code> (then remote).
        </p>
      </div>
    );
  }

  const pageData: AdminUsagePageData = {
    days,
    credits: creditsResult.data,
    defaultKey: defaultKeyResult.data,
  };

  return <AdminUsageDashboard data={pageData} />;
}
