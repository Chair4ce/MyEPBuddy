import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface TokenInfo {
  token_id: string;
  shell_type: string;
  shell_id: string;
  created_by: string;
  ratee_name: string;
  ratee_rank: string | null;
  link_label: string | null;
  is_anonymous: boolean;
  status: string;
}

interface EPBShellData {
  shell_id: string;
  duty_description: string | null;
  cycle_year: number;
  ratee_name: string;
  ratee_rank: string | null;
  link_label: string | null;
  is_anonymous: boolean;
  sections: Array<{ mpa: string; statement_text: string }> | null;
}

interface AwardShellData {
  shell_id: string;
  award_title: string | null;
  category: string | null;
  cycle_year: number;
  ratee_name: string;
  ratee_rank: string | null;
  link_label: string | null;
  is_anonymous: boolean;
  sections: Array<{ key: string; label: string; content: string }> | null;
}

interface DecorationShellData {
  shell_id: string;
  award_type: string;
  reason: string | null;
  duty_title: string | null;
  ratee_name: string;
  ratee_rank: string | null;
  link_label: string | null;
  is_anonymous: boolean;
  sections: Array<{ key: string; label: string; content: string }> | null;
}

// GET: Validate token and get shell data for review (public)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = await createClient();
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // First validate the token
    const tokenResult = await supabase
      .rpc("validate_review_token", { p_token: token } as never);
    
    const tokenData = tokenResult.data as TokenInfo[] | null;
    const tokenError = tokenResult.error;

    if (tokenError) {
      console.error("Token validation error:", tokenError);
      return NextResponse.json(
        { error: "Failed to validate token" },
        { status: 500 }
      );
    }

    if (!tokenData || tokenData.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired review link" },
        { status: 404 }
      );
    }

    const tokenInfo = tokenData[0];

    if (tokenInfo.status !== "active") {
      return NextResponse.json(
        { 
          error: tokenInfo.status === "submitted" 
            ? "This review link has already been used" 
            : "This review link has expired"
        },
        { status: 410 }
      );
    }

    // Get shell data based on type
    if (tokenInfo.shell_type === "epb") {
      const epbResult = await supabase
        .rpc("get_epb_shell_for_review", { p_token: token } as never);
      
      const epbData = epbResult.data as EPBShellData[] | null;
      const epbError = epbResult.error;

      if (epbError) {
        console.error("EPB fetch error:", epbError);
        return NextResponse.json(
          { error: "Failed to fetch EPB data" },
          { status: 500 }
        );
      }

      if (!epbData || epbData.length === 0) {
        return NextResponse.json(
          { error: "EPB not found" },
          { status: 404 }
        );
      }

      const epb = epbData[0];
      return NextResponse.json({
        shellType: "epb",
        shellId: epb.shell_id,
        rateeName: epb.ratee_name,
        rateeRank: epb.ratee_rank,
        linkLabel: epb.link_label,
        isAnonymous: epb.is_anonymous,
        cycleYear: epb.cycle_year,
        dutyDescription: epb.duty_description,
        sections: epb.sections,
      });
    }

    // Award shell
    if (tokenInfo.shell_type === "award") {
      const awardResult = await supabase
        .rpc("get_award_shell_for_review", { p_token: token } as never);
      
      const awardData = awardResult.data as AwardShellData[] | null;
      const awardError = awardResult.error;

      if (awardError) {
        console.error("Award fetch error:", awardError);
        return NextResponse.json(
          { error: "Failed to fetch Award data" },
          { status: 500 }
        );
      }

      if (!awardData || awardData.length === 0) {
        return NextResponse.json(
          { error: "Award not found" },
          { status: 404 }
        );
      }

      const award = awardData[0];
      return NextResponse.json({
        shellType: "award",
        shellId: award.shell_id,
        rateeName: award.ratee_name,
        rateeRank: award.ratee_rank,
        linkLabel: award.link_label,
        isAnonymous: award.is_anonymous,
        title: award.award_title,
        cycleYear: award.cycle_year,
        sections: award.sections,
      });
    }

    // Decoration shell
    if (tokenInfo.shell_type === "decoration") {
      const decorationResult = await supabase
        .rpc("get_decoration_shell_for_review", { p_token: token } as never);
      
      const decorationData = decorationResult.data as DecorationShellData[] | null;
      const decorationError = decorationResult.error;

      if (decorationError) {
        console.error("Decoration fetch error:", decorationError);
        return NextResponse.json(
          { error: "Failed to fetch Decoration data" },
          { status: 500 }
        );
      }

      if (!decorationData || decorationData.length === 0) {
        return NextResponse.json(
          { error: "Decoration not found" },
          { status: 404 }
        );
      }

      const decoration = decorationData[0];
      return NextResponse.json({
        shellType: "decoration",
        shellId: decoration.shell_id,
        rateeName: decoration.ratee_name,
        rateeRank: decoration.ratee_rank,
        linkLabel: decoration.link_label,
        isAnonymous: decoration.is_anonymous,
        title: decoration.award_type,
        sections: decoration.sections,
      });
    }

    return NextResponse.json(
      { error: `Shell type ${tokenInfo.shell_type} not supported` },
      { status: 501 }
    );
  } catch (error) {
    console.error("Review data fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
