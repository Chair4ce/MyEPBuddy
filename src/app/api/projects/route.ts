import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { Project, ProjectMember } from "@/types/database";

// GET /api/projects - List user's projects
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cycleYear = searchParams.get("cycle_year");

    // Fetch projects where user is a member
    let query = supabase
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
      .order("updated_at", { ascending: false });

    if (cycleYear) {
      query = query.eq("cycle_year", parseInt(cycleYear));
    }

    const { data: projects, error } = await query;

    if (error) {
      console.error("Error fetching projects:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ projects: projects || [] });
  } catch (error) {
    console.error("Error in GET /api/projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, scope, result, impact, key_stakeholders, metrics, cycle_year } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    // Create the project (trigger will auto-add creator as owner)
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        scope: scope?.trim() || null,
        result: result?.trim() || null,
        impact: impact?.trim() || null,
        key_stakeholders: key_stakeholders || [],
        metrics: metrics || {},
        cycle_year: cycle_year || new Date().getFullYear(),
        created_by: user.id,
      })
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
      console.error("Error creating project:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error in POST /api/projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
