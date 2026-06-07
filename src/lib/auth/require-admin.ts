import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server-side admin gate for /admin routes and admin-only server actions. */
export async function requireAdminUser(): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if ((profile as { role?: string } | null)?.role !== "admin") {
    redirect("/dashboard");
  }
}
