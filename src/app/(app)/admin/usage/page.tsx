import { redirect } from "next/navigation";
import { getAdminApiUser } from "@/lib/auth/require-admin";
import { AdminUsageDashboard } from "@/components/admin/admin-usage-dashboard";
import type {
  AdminUsagePageData,
  DefaultKeyUsageData,
  UserCreditAnalyticsData,
} from "@/components/admin/admin-usage-types";

export const dynamic = "force-dynamic";

const ALLOWED_DAYS = [7, 30, 90, 365] as const;
const DEFAULT_DAYS = 30;

type RpcError = { message?: string; code?: string } | null;

function resolveDays(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  return (ALLOWED_DAYS as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_DAYS;
}

function isSessionAuthError(error: RpcError): boolean {
  const message = (error?.message ?? "").toLowerCase();
  const code = (error?.code ?? "").toUpperCase();
  // Do not treat Postgres 42501 (missing EXECUTE) as session expiry once
  // getAdminApiUser already succeeded — that is a grant/config problem.
  return (
    code === "PGRST301" ||
    message.includes("jwt") ||
    message.includes("not authenticated") ||
    message.includes("unauthorized") ||
    message.includes("invalid claim")
  );
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  // Authenticate in the page itself — layout gates can race with page data
  // fetches in the App Router when the browser session is already dead.
  const admin = await getAdminApiUser();
  if (!admin.ok) {
    redirect(admin.status === 401 ? "/login" : "/dashboard");
  }

  const { supabase } = admin;
  const days = resolveDays((await searchParams).days);

  let defaultKeyResult: {
    data: DefaultKeyUsageData | null;
    error: RpcError;
  };
  let creditsResult: {
    data: UserCreditAnalyticsData | null;
    error: RpcError;
  };

  try {
    // Keep the call as a member expression so `this` stays bound.
    const [defaultKey, credits] = await Promise.all([
      supabase.rpc(
        "admin_default_key_token_usage" as never,
        { p_days: days } as never
      ),
      supabase.rpc(
        "admin_user_credit_analytics" as never,
        { p_days: days } as never
      ),
    ]);

    defaultKeyResult = {
      data: (defaultKey.data as DefaultKeyUsageData | null) ?? null,
      error: (defaultKey.error as RpcError) ?? null,
    };
    creditsResult = {
      data: (credits.data as UserCreditAnalyticsData | null) ?? null,
      error: (credits.error as RpcError) ?? null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load usage data.";
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Usage Analytics</h1>
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      </div>
    );
  }

  if (
    isSessionAuthError(defaultKeyResult.error) ||
    isSessionAuthError(creditsResult.error)
  ) {
    redirect("/login");
  }

  if (
    defaultKeyResult.error ||
    creditsResult.error ||
    !defaultKeyResult.data ||
    !creditsResult.data
  ) {
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
