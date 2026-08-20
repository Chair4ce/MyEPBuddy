import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDictionarySynonyms } from "@/lib/datamuse-synonyms";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchDictionarySynonyms", () => {
  it("merges strict synonyms ahead of means-like words and drops the original", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("rel_syn")) {
          return {
            ok: true,
            json: async () => [{ word: "drove" }, { word: "led" }, { word: "headed" }],
          };
        }
        return {
          ok: true,
          json: async () => [{ word: "headed" }, { word: "commanded" }, { word: "led the charge" }],
        };
      }),
    );

    const words = await fetchDictionarySynonyms("Led");
    expect(words).toEqual(["drove", "headed", "commanded"]);
  });

  it("returns an empty list for a blank word without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchDictionarySynonyms("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
