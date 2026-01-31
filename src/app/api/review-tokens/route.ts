import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ReviewToken {
  id: string;
  token: string;
  shell_type: string;
  shell_id: string;
  created_by: string;
  ratee_name: string;
  ratee_rank: string | null;
  link_label: string | null;
  is_anonymous: boolean;
  recipient_email: string | null;
  email_sent_at: string | null;
  expires_at: string;
  status: string;
  created_at: string;
}

// POST: Create a new review token
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      shellType,
      shellId,
      rateeName,
      rateeRank,
      linkLabel,
      isAnonymous,
      recipientEmail,
    } = body;

    // Validate required fields
    if (!shellType || !shellId || !rateeName) {
      return NextResponse.json(
        { error: "Missing required fields: shellType, shellId, rateeName" },
        { status: 400 }
      );
    }

    // Validate shell type
    if (!["epb", "award", "decoration"].includes(shellType)) {
      return NextResponse.json(
        { error: "Invalid shell type" },
        { status: 400 }
      );
    }

    // Validate labeled link has a label
    if (!isAnonymous && !linkLabel) {
      return NextResponse.json(
        { error: "Labeled links require a link label" },
        { status: 400 }
      );
    }

    // Generate secure token
    const { data: tokenData, error: tokenError } = await supabase
      .rpc("generate_review_token");
    
    if (tokenError || !tokenData) {
      console.error("Token generation error:", tokenError);
      return NextResponse.json(
        { error: "Failed to generate token" },
        { status: 500 }
      );
    }

    // Create the review token record
    const result = await supabase
      .from("review_tokens")
      .insert({
        token: tokenData as string,
        shell_type: shellType,
        shell_id: shellId,
        created_by: user.id,
        ratee_name: rateeName,
        ratee_rank: rateeRank || null,
        link_label: isAnonymous ? null : linkLabel,
        is_anonymous: isAnonymous || false,
        recipient_email: recipientEmail || null,
      } as never)
      .select()
      .single();
    
    const reviewToken = result.data as ReviewToken | null;
    const insertError = result.error;

    if (insertError || !reviewToken) {
      console.error("Insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create review token" },
        { status: 500 }
      );
    }

    // Build the review URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const reviewUrl = `${baseUrl}/review/${shellType}/${tokenData}`;

    return NextResponse.json({
      success: true,
      token: tokenData,
      reviewUrl,
      expiresAt: reviewToken.expires_at,
      linkLabel: reviewToken.link_label,
      isAnonymous: reviewToken.is_anonymous,
    });
  } catch (error) {
    console.error("Review token creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: List user's review tokens
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const shellType = searchParams.get("shellType");
    const shellId = searchParams.get("shellId");

    let query = supabase
      .from("review_tokens")
      .select("*")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });

    if (shellType) {
      query = query.eq("shell_type", shellType);
    }
    if (shellId) {
      query = query.eq("shell_id", shellId);
    }

    const { data: tokens, error } = await query;

    if (error) {
      console.error("Fetch tokens error:", error);
      return NextResponse.json(
        { error: "Failed to fetch tokens" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("Review tokens fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Revoke a review token
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get("id");

    if (!tokenId) {
      return NextResponse.json(
        { error: "Token ID required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("review_tokens")
      .update({ status: "expired" } as never)
      .eq("id", tokenId)
      .eq("created_by", user.id);

    if (error) {
      console.error("Revoke token error:", error);
      return NextResponse.json(
        { error: "Failed to revoke token" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Token revoke error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
