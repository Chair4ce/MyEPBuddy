import { getModelCatalogForSettings } from "@/app/actions/ai-models";
import { ModelSettingsForm } from "@/components/settings/model-settings-form";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ModelSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, data] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    getModelCatalogForSettings(),
  ]);

  const isAdmin = (profile as { role: string } | null)?.role === "admin";

  return (
    <ModelSettingsForm
      isAdmin={isAdmin}
      initialAllModels={data.allModels}
      initialPreferences={data.preferences}
      initialAvailableModels={data.availableModels}
      initialCatalogSyncedAt={data.catalogSyncedAt}
    />
  );
}
