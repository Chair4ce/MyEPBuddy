import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id] - Get project details with members and accomplishments
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch project with members
    const { data: project, error } = await supabase
      .from("projects")
      .select(`
        *,
        members:project_members(
          *,
          profile:profiles!project_members_profile_id_fkey(id, full_name, rank, afsc, avatar_url),
          team_member:team_members(id, full_name, rank, afsc)
        ),
        creator_profile:profiles!projects_created_by_fkey(id, full_name, rank)
      `)
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      console.error("Error fetching project:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch accomplishments linked to this project (with visibility filtering via RLS)
    const { data: accomplishmentLinks } = await supabase
      .from("accomplishment_projects")
      .select(`
        *,
        accomplishment:accomplishments(
          *,
          owner_profile:profiles!accomplishments_user_id_fkey(id, full_name, rank),
          team_member:team_members(id, full_name, rank)
        )
      `)
      .eq("project_id", id);

    return NextResponse.json({
      project,
      accomplishments: accomplishmentLinks?.map((link) => link.accomplishment) || [],
    });
  } catch (error) {
    console.error("Error in GET /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id] - Update project metadata (owners only)
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, scope, result, impact, key_stakeholders, metrics } = body;

    // Update project (RLS will enforce ownership)
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (scope !== undefined) updates.scope = scope?.trim() || null;
    if (result !== undefined) updates.result = result?.trim() || null;
    if (impact !== undefined) updates.impact = impact?.trim() || null;
    if (key_stakeholders !== undefined) updates.key_stakeholders = key_stakeholders;
    if (metrics !== undefined) updates.metrics = metrics;

    const { data: project, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", id)
      .select(`
        *,
        members:project_members(
          *,
          profile:profiles!project_members_profile_id_fkey(id, full_name, rank, afsc, avatar_url),
          team_member:team_members(id, full_name, rank, afsc)
        ),
        creator_profile:profiles!projects_created_by_fkey(id, full_name, rank)
      `)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Project not found or you don't have permission to update it" },
          { status: 404 }
        );
      }
      console.error("Error updating project:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error in PUT /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete project (owners only)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete project (RLS will enforce ownership)
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting project:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
