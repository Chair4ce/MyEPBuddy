import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AppInitializer } from "@/components/layout/app-initializer";
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
    
    // Fetch managed members (placeholder subordinates)
    const { data: managedData } = await supabase
      .from("team_members")
      .select("*")
      .eq("supervisor_id", user.id)
      .order("full_name", { ascending: true });
    
    managedMembers = (managedData as unknown as ManagedMember[]) || [];
  }

  return (
    <AppInitializer
      profile={profile}
      subordinates={subordinates}
      managedMembers={managedMembers}
      epbConfig={epbConfig}
    >
      <div className="flex h-screen overflow-hidden">
        <AppSidebar profile={profile} />
        <div className="flex-1 flex flex-col ml-0 lg:ml-64 min-w-0 overflow-hidden">
          <AppHeader profile={profile} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <main className="flex flex-col items-center w-full p-4 md:p-6 lg:p-8 animate-fade-in">
              {children}
            </main>
          </div>
        </div>
      </div>
    </AppInitializer>
  );
}
