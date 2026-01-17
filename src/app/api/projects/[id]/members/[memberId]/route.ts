import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string; memberId: string }>;
}

// PUT /api/projects/[id]/members/[memberId] - Update member (ownership status)
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id: projectId, memberId } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { is_owner } = body;

    if (is_owner === undefined) {
      return NextResponse.json(
        { error: "is_owner field is required" },
        { status: 400 }
      );
    }

    // Update member (RLS will enforce ownership)
    const { data: member, error } = await supabase
      .from("project_members")
      .update({ is_owner })
      .eq("id", memberId)
      .eq("project_id", projectId)
      .select(`
        *,
        profile:profiles!project_members_profile_id_fkey(id, full_name, rank, afsc, avatar_url),
        team_member:team_members(id, full_name, rank, afsc)
      `)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Member not found or you don't have permission to update" },
          { status: 404 }
        );
      }
      console.error("Error updating project member:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ member });
  } catch (error) {
    console.error("Error in PUT /api/projects/[id]/members/[memberId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/members/[memberId] - Remove member from project
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id: projectId, memberId } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete member (RLS will enforce ownership and prevent removing last owner)
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("id", memberId)
      .eq("project_id", projectId);

    if (error) {
      console.error("Error removing project member:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/projects/[id]/members/[memberId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
