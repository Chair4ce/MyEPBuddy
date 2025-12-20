import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AppInitializer } from "@/components/layout/app-initializer";
import type { Profile, EPBConfig } from "@/types/database";

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
  if (profile) {
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
  }

  return (
    <AppInitializer
      profile={profile}
      subordinates={subordinates}
      epbConfig={epbConfig}
    >
      <div className="flex min-h-screen">
        <AppSidebar profile={profile} />
        <div className="flex-1 flex flex-col ml-0 lg:ml-64">
          <AppHeader profile={profile} />
          <main className="flex-1 flex flex-col items-center w-full p-4 md:p-6 lg:p-8 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </AppInitializer>
  );
}
