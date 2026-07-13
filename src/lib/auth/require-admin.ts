import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type AppSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type AdminAuthSuccess = {
  ok: true;
  user: User;
  supabase: AppSupabaseClient;
};

type AdminAuthFailure = {
  ok: false;
  status: 401 | 403;
  error: string;
};

/** Server-side admin gate for /admin routes and admin-only server actions. */
export async function requireAdminUser(): Promise<void> {
  const result = await getAdminApiUser();
  if (!result.ok) {
    redirect(result.status === 401 ? "/login" : "/dashboard");
  }
}

/**
 * Admin gate for API routes — returns 401/403 payloads instead of redirecting.
 */
export async function getAdminApiUser(): Promise<AdminAuthSuccess | AdminAuthFailure> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if ((profile as { role?: string } | null)?.role !== "admin") {
    return { ok: false, status: 403, error: "Access denied" };
  }

  return { ok: true, user, supabase };
}
