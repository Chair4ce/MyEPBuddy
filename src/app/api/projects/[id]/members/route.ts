import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/members - Get project members with visibility info
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use the database function to get members with visibility info
    const { data: members, error } = await supabase
      .rpc("get_project_members_with_visibility", {
        p_project_id: projectId,
        p_viewer_id: user.id,
      });

    if (error) {
      console.error("Error fetching project members:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ members: members || [] });
  } catch (error) {
    console.error("Error in GET /api/projects/[id]/members:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/members - Add a member to the project
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { profile_id, team_member_id, is_owner } = body;

    if (!profile_id && !team_member_id) {
      return NextResponse.json(
        { error: "Either profile_id or team_member_id is required" },
        { status: 400 }
      );
    }

    if (profile_id && team_member_id) {
      return NextResponse.json(
        { error: "Cannot specify both profile_id and team_member_id" },
        { status: 400 }
      );
    }

    // Add member (RLS will enforce permission)
    const { data: member, error } = await supabase
      .from("project_members")
      .insert({
        project_id: projectId,
        profile_id: profile_id || null,
        team_member_id: team_member_id || null,
        is_owner: is_owner || false,
        added_by: user.id,
      })
      .select(`
        *,
        profile:profiles!project_members_profile_id_fkey(id, full_name, rank, afsc, avatar_url),
        team_member:team_members(id, full_name, rank, afsc)
      `)
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This member is already part of the project" },
          { status: 409 }
        );
      }
      if (error.code === "42501") {
        return NextResponse.json(
          { error: "You don't have permission to add this member" },
          { status: 403 }
        );
      }
      console.error("Error adding project member:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ member });
  } catch (error) {
    console.error("Error in POST /api/projects/[id]/members:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
