import { sanitizeThesaurusWord } from "@/lib/word-thesaurus";

interface DatamuseWord {
  word?: unknown;
}

function asWordList(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "word" in item) {
        const word = (item as DatamuseWord).word;
        return typeof word === "string" ? word : "";
      }
      return "";
    })
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && !word.includes(" "));
}

/**
 * Dictionary synonyms via Datamuse (no API key). Used for "see all synonyms"
 * after context-aware LLM suggestions are shown.
 */
export async function fetchDictionarySynonyms(
  word: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const sanitized = sanitizeThesaurusWord(word);
  if (!sanitized) return [];

  const encoded = encodeURIComponent(sanitized.toLowerCase());
  const [synResponse, meansLikeResponse] = await Promise.all([
    fetch(`https://api.datamuse.com/words?rel_syn=${encoded}&max=40`, { signal }),
    fetch(`https://api.datamuse.com/words?ml=${encoded}&max=50`, { signal }),
  ]);

  if (!synResponse.ok && !meansLikeResponse.ok) {
    throw new Error("Failed to fetch dictionary synonyms");
  }

  const [synData, meansLikeData] = await Promise.all([
    synResponse.ok ? synResponse.json() : [],
    meansLikeResponse.ok ? meansLikeResponse.json() : [],
  ]);

  const seen = new Set<string>([sanitized.toLowerCase()]);
  const merged: string[] = [];
  for (const candidate of [...asWordList(synData), ...asWordList(meansLikeData)]) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
    if (merged.length >= 50) break;
  }
  return merged;
}
