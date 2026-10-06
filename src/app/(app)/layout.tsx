import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { InactivityRestoredBanner } from "@/components/layout/inactivity-restored-banner";
import { AppInitializer } from "@/components/layout/app-initializer";
import { PageTransition } from "@/components/layout/page-transition";
import { FloatingActionButtons } from "@/components/layout/floating-action-buttons";
import type { Profile, EPBConfig, ManagedMember } from "@/types/database";

// Prevent caching of user-specific data
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Profile, singleton config, and team links do not depend on each other.
  const [profileResult, configResult, teamResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("epb_config").select("*").eq("id", 1).single(),
    supabase
      .from("teams")
      .select("subordinate_id")
      .eq("supervisor_id", user.id),
  ]);

  const profile = profileResult.data as unknown as Profile | null;
  const epbConfig = configResult.data as unknown as EPBConfig | null;

  // Fetch subordinates for any member (anyone can have subordinates)
  let subordinates: Profile[] = [];
  let managedMembers: ManagedMember[] = [];

  if (profile) {
    const typedTeamData = (teamResult.data || []) as unknown as {
      subordinate_id: string;
    }[];
    const subordinateIds = typedTeamData.map((t) => t.subordinate_id);

    // Subordinate profiles need the id list; the managed-member RPC does not.
    const [subProfilesResult, managedResult] = await Promise.all([
      subordinateIds.length > 0
        ? supabase.from("profiles").select("*").in("id", subordinateIds)
        : Promise.resolve({ data: [] as Profile[] }),
      (supabase.rpc as Function)("get_visible_managed_members", {
        viewer_uuid: user.id,
      }) as Promise<{ data: ManagedMember[] | null }>,
    ]);

    subordinates = (subProfilesResult.data as unknown as Profile[]) || [];

    // Filter out archived members and sort by name.
    // get_visible_managed_members returns members this user created, members
    // reporting to them, and the same sets rolled up through subordinates.
    managedMembers = (managedResult.data || [])
      .filter((m) => m.member_status !== "archived")
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }

  return (
    <AppInitializer
      key={user.id}
      profile={profile}
      subordinates={subordinates}
      managedMembers={managedMembers}
      epbConfig={epbConfig}
    >
      <div className="fixed inset-0 flex overflow-hidden">
        <AppSidebar profile={profile} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Suspense fallback={null}>
            <InactivityRestoredBanner />
          </Suspense>
          <AppHeader profile={profile} />
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <main className="flex flex-col items-center w-full h-full min-h-0 p-3 md:p-6 lg:p-8 overflow-y-auto">
              <PageTransition className="w-full min-h-0">{children}</PageTransition>
            </main>
          </div>
        </div>
        <FloatingActionButtons />
      </div>
    </AppInitializer>
  );
}
