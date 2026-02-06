import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";
import { buildACAAssessmentPrompt, ENTRY_MGAS, getRubricTierForRank } from "@/lib/constants";
import type { EPBAssessmentResult } from "@/lib/constants";
import type { Rank } from "@/types/database";

// Allow up to 60s for LLM calls
export const maxDuration = 60;

interface AssessEPBRequest {
  shellId: string;
  rateeRank: Rank;
  rateeAfsc: string | null;
  model?: string;
  dutyDescription?: string; // Optional - member's duty description for context
}

function getModelProvider(
  modelId: string,
  userKeys: {
    openai_key?: string | null;
    anthropic_key?: string | null;
    google_key?: string | null;
    grok_key?: string | null;
  } | null
) {
  const provider = modelId.includes("claude")
    ? "anthropic"
    : modelId.includes("gemini")
      ? "google"
      : modelId.includes("grok")
        ? "xai"
        : "openai";

  switch (provider) {
    case "anthropic": {
      const customAnthropic = createAnthropic({
        apiKey: userKeys?.anthropic_key || process.env.ANTHROPIC_API_KEY || "",
      });
      return customAnthropic(modelId);
    }
    case "google": {
      const customGoogle = createGoogleGenerativeAI({
        apiKey: userKeys?.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
      });
      return customGoogle(modelId);
    }
    case "xai": {
      const customXai = createXai({
        apiKey: userKeys?.grok_key || process.env.XAI_API_KEY || "",
      });
      return customXai(modelId);
    }
    default: {
      const customOpenai = createOpenAI({
        apiKey: userKeys?.openai_key || process.env.OPENAI_API_KEY || "",
      });
      return customOpenai(modelId);
    }
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: AssessEPBRequest = await request.json();
    const { shellId, rateeRank, rateeAfsc, model = "gemini-2.0-flash", dutyDescription } = body;

    if (!shellId || !rateeRank) {
      return NextResponse.json(
        { error: "Missing required fields: shellId and rateeRank" },
        { status: 400 }
      );
    }

    // Fetch the EPB shell and its sections
    interface EPBShellSection {
      mpa: string;
      statement_text: string;
      is_complete: boolean;
    }
    
    interface EPBShellData {
      id: string;
      user_id: string;
      created_by: string;
      duty_description: string;
      sections: EPBShellSection[];
    }
    
    const { data: shellData, error: shellError } = await supabase
      .from("epb_shells")
      .select(`
        id,
        user_id,
        created_by,
        duty_description,
        sections:epb_shell_sections(mpa, statement_text, is_complete)
      `)
      .eq("id", shellId)
      .single();

    if (shellError || !shellData) {
      return NextResponse.json(
        { error: "EPB shell not found" },
        { status: 404 }
      );
    }

    // Cast to proper type
    const shell = shellData as unknown as EPBShellData;

    // Verify user has access to this shell (owner, creator, or shared)
    const isOwner = shell.user_id === user.id;
    const isCreator = shell.created_by === user.id;
    
    // Check if shared with user
    const { data: shareData } = await supabase
      .from("epb_shell_shares")
      .select("id")
      .eq("shell_id", shellId)
      .eq("shared_with_id", user.id)
      .single();
    
    const isShared = !!shareData;

    if (!isOwner && !isCreator && !isShared) {
      return NextResponse.json(
        { error: "Access denied to this EPB shell" },
        { status: 403 }
      );
    }

    // Extract statements from sections (only core MPAs, not HLR)
    const sections = shell.sections || [];
    const statements = sections
      .filter((s) => ENTRY_MGAS.some((m) => m.key === s.mpa))
      .filter((s) => s.statement_text && s.statement_text.trim().length > 10)
      .map((s) => ({
        mpa: s.mpa,
        text: s.statement_text,
      }));

    if (statements.length === 0) {
      return NextResponse.json(
        { error: "No statements found to assess. Please complete at least one MPA section." },
        { status: 400 }
      );
    }

    // Get user API keys (decrypted)
    const userKeys = await getDecryptedApiKeys();

    // Build the assessment prompt
    // Use duty description from request or fall back to what's stored in the shell
    const effectiveDutyDescription = dutyDescription || shell.duty_description || "";
    
    const assessmentPrompt = buildACAAssessmentPrompt(
      rateeRank,
      rateeAfsc,
      statements,
      effectiveDutyDescription
    );

    // Get model provider
    const modelProvider = getModelProvider(model, userKeys);

    // Generate the assessment
    const { text } = await generateText({
      model: modelProvider,
      system: `You are an expert Air Force performance evaluator. You assess EPB statements using the official ACA (Airman Comprehensive Assessment) rubric from AF Form 931 (for AB through TSgt) or AF Form 932 (for MSgt through SMSgt). Respond only with valid JSON.`,
      prompt: assessmentPrompt,
      temperature: 0.3, // Lower temperature for more consistent evaluations
      maxTokens: 4000,
    });

    // Parse the response
    let assessment: EPBAssessmentResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        assessment = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse assessment response:", parseError);
      console.error("Raw response:", text);
      return NextResponse.json(
        { error: "Failed to parse assessment results. Please try again." },
        { status: 500 }
      );
    }

    // Validate the assessment structure (support both old mpaAssessments and new categoryAssessments)
    const hasCategories = assessment.categoryAssessments && Array.isArray(assessment.categoryAssessments);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasMPAs = (assessment as any).mpaAssessments && Array.isArray((assessment as any).mpaAssessments);
    
    if (!hasCategories && !hasMPAs) {
      return NextResponse.json(
        { error: "Invalid assessment structure returned" },
        { status: 500 }
      );
    }
    
    // Migrate old format to new format if needed
    if (!hasCategories && hasMPAs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldAssessment = assessment as any;
      assessment.categoryAssessments = oldAssessment.mpaAssessments.map((mpa: any) => ({
        categoryKey: mpa.mpaKey,
        categoryLabel: mpa.mpaLabel,
        overallLevel: mpa.overallLevel,
        subcategoryScores: mpa.alqScores || [],
        summary: mpa.summary,
      }));
      assessment.rubricTier = "junior";
      assessment.formUsed = "AF Form 931";
    }

    // Add timestamp if not present
    if (!assessment.timestamp) {
      assessment.timestamp = new Date().toISOString();
    }
    
    // Ensure rubricTier and formUsed are set based on ratee's rank
    if (!assessment.rubricTier) {
      assessment.rubricTier = getRubricTierForRank(rateeRank);
    }
    if (!assessment.formUsed) {
      assessment.formUsed = assessment.rubricTier === "senior" ? "AF Form 932" : "AF Form 931";
    }

    return NextResponse.json({ assessment });
  } catch (error) {
    console.error("Assess EPB API error:", error);
    return NextResponse.json(
      { error: "Failed to assess EPB statements" },
      { status: 500 }
    );
  }
}

