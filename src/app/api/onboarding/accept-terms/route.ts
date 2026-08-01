import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const acceptedAt = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({ terms_accepted_at: acceptedAt } as never)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save acceptance" }, { status: 500 });
  }

  return NextResponse.json({ termsAcceptedAt: acceptedAt });
}
