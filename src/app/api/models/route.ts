import { NextResponse } from "next/server";
import { getAvailableModels } from "@/app/actions/ai-models";
import type { ModelContext } from "@/lib/ai-models/types";

const VALID_CONTEXTS = new Set<ModelContext>([
  "generate",
  "award",
  "decoration",
  "library",
  "global",
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawContext = searchParams.get("context");
  const context =
    rawContext && VALID_CONTEXTS.has(rawContext as ModelContext)
      ? (rawContext as ModelContext)
      : undefined;

  try {
    const result = await getAvailableModels(context);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("[GET /api/models]", error);
    return NextResponse.json(
      { error: "Failed to load available models" },
      { status: 500 },
    );
  }
}
