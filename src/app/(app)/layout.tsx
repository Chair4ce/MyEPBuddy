import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AppInitializer } from "@/components/layout/app-initializer";
import { PageTransition } from "@/components/layout/page-transition";
import type { Profile, EPBConfig, ManagedMember } from "@/types/database";

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

  // Fetch user profile
  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const profile = profileData as unknown as Profile | null;

  // Fetch EPB config
  const { data: configData } = await supabase
    .from("epb_config")
    .select("*")
    .eq("id", 1)
    .single();

  const epbConfig = configData as unknown as EPBConfig | null;

  // Fetch subordinates for any member (anyone can have subordinates)
  let subordinates: Profile[] = [];
  let managedMembers: ManagedMember[] = [];
  
  if (profile) {
    // Fetch real subordinates from teams table
    const { data: teamData } = await supabase
      .from("teams")
      .select("subordinate_id")
      .eq("supervisor_id", user.id);

    if (teamData && teamData.length > 0) {
      const typedTeamData = teamData as unknown as { subordinate_id: string }[];
      const subordinateIds = typedTeamData.map((t) => t.subordinate_id);
      const { data: subProfiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", subordinateIds);
      subordinates = (subProfiles as unknown as Profile[]) || [];
    }
    
    // Fetch managed members visible to this user (includes chain visibility)
    // Uses get_visible_managed_members function which returns:
    // - Members user created
    // - Members reporting to user
    // - Members created by user's subordinates (rolling up)
    // - Members reporting to user's subordinates
    const { data: managedData } = await (supabase.rpc as Function)(
      "get_visible_managed_members",
      { viewer_uuid: user.id }
    ) as { data: ManagedMember[] | null };
    
    // Filter out archived members and sort by name
    managedMembers = (managedData || [])
      .filter((m) => m.member_status !== "archived")
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }

  return (
    <AppInitializer
      profile={profile}
      subordinates={subordinates}
      managedMembers={managedMembers}
      epbConfig={epbConfig}
    >
      <div className="fixed inset-0 flex overflow-hidden">
        <AppSidebar profile={profile} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <AppHeader profile={profile} />
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <main className="flex flex-col items-center w-full h-full min-h-0 p-3 md:p-6 lg:p-8 overflow-y-auto">
              <PageTransition className="w-full min-h-0">{children}</PageTransition>
            </main>
          </div>
        </div>
      </div>
    </AppInitializer>
  );
}
