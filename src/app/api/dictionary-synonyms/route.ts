import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchDictionarySynonyms } from "@/lib/datamuse-synonyms";
import { isSingleSelectableWord, sanitizeThesaurusWord } from "@/lib/word-thesaurus";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const word = sanitizeThesaurusWord(
      new URL(request.url).searchParams.get("word") ?? "",
    );
    if (!isSingleSelectableWord(word)) {
      return NextResponse.json(
        { error: "Select a single word to look up synonyms" },
        { status: 400 },
      );
    }

    const synonyms = await fetchDictionarySynonyms(word);
    return NextResponse.json({ synonyms });
  } catch (error) {
    console.error("GET /api/dictionary-synonyms", error);
    return NextResponse.json(
      { error: "Failed to load dictionary synonyms" },
      { status: 502 },
    );
  }
}
