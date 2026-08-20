"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { fetchDictionarySynonyms } from "@/lib/datamuse-synonyms";
import { handleUsageLimitResponse } from "@/stores/usage-limit-store";
import {
  applyRangeReplacement,
  isSingleSelectableWord,
  preserveReplacementCase,
  sentenceContainingRange,
  shouldAutoFetchSuggestions,
  splitSuggestedAndRest,
  trimSelection,
  type PhraseReviseMode,
  type WordThesaurusDocumentContext,
} from "@/lib/word-thesaurus";

const SUGGEST_DEBOUNCE_MS = 280;

export interface ThesaurusTextSource {
  text: string;
  onChange: (next: string) => void;
}

export interface UseWordThesaurusOptions {
  model: string;
  documentContext: WordThesaurusDocumentContext;
  enablePhraseRevise?: boolean;
}

export function useWordThesaurus({
  model,
  documentContext,
  enablePhraseRevise = true,
}: UseWordThesaurusOptions) {
  const [open, setOpen] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [allSynonyms, setAllSynonyms] = useState<string[]>([]);
  const [showAllSynonyms, setShowAllSynonyms] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [revisionResults, setRevisionResults] = useState<string[]>([]);
  const [isRevising, setIsRevising] = useState(false);

  const sourceRef = useRef<ThesaurusTextSource | null>(null);
  const rangeRef = useRef({ start: 0, end: 0 });
  const selectedRef = useRef("");
  const suggestAbortRef = useRef<AbortController | null>(null);
  const allAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const suggestionKeyRef = useRef("");

  const isSingleWord = isSingleSelectableWord(selectedText);

  const abortPending = useCallback(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    suggestAbortRef.current?.abort();
    suggestAbortRef.current = null;
    allAbortRef.current?.abort();
    allAbortRef.current = null;
  }, []);

  const resetLists = useCallback(() => {
    setSuggested([]);
    setAllSynonyms([]);
    setShowAllSynonyms(false);
    setRevisionResults([]);
    setIsLoadingSuggestions(false);
    setIsLoadingAll(false);
    setIsRevising(false);
    suggestionKeyRef.current = "";
  }, []);

  const close = useCallback(() => {
    abortPending();
    setOpen(false);
    setSelectedText("");
    resetLists();
    sourceRef.current = null;
  }, [abortPending, resetLists]);

  const fetchSuggestions = useCallback(
    async (word: string, fullStatement: string, sentence: string) => {
      const key = `${word.toLowerCase()}::${sentence}`;
      if (suggestionKeyRef.current === key) return;

      suggestAbortRef.current?.abort();
      const controller = new AbortController();
      suggestAbortRef.current = controller;
      suggestionKeyRef.current = key;
      setIsLoadingSuggestions(true);
      setSuggested([]);

      try {
        const response = await fetchWithRetry(
          "/api/synonyms",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word,
              fullStatement,
              sentence,
              model,
              context: documentContext,
            }),
            signal: controller.signal,
          },
          { timeout: 45000 },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (handleUsageLimitResponse(errorData)) return;
          throw new Error(errorData.error || "Failed to fetch replacements");
        }

        const data = await response.json();
        const raw: string[] = Array.isArray(data.suggestions)
          ? data.suggestions
          : Array.isArray(data.synonyms)
            ? data.synonyms
            : [];
        const { suggested: nextSuggested } = splitSuggestedAndRest(raw);
        setSuggested(nextSuggested);
      } catch (error) {
        if (controller.signal.aborted) return;
        suggestionKeyRef.current = "";
        console.error("Thesaurus suggestion error:", error);
        toast.error(error instanceof Error ? error.message : "Failed to get replacements");
        setSuggested([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSuggestions(false);
        }
      }
    },
    [documentContext, model],
  );

  const handleTextSelect = useCallback(
    (textarea: HTMLTextAreaElement | null, source: ThesaurusTextSource) => {
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const raw = source.text.slice(start, end);
      const trimmed = trimSelection(raw);

      if (!trimmed || start === end) {
        if (open) close();
        return;
      }

      sourceRef.current = source;
      rangeRef.current = { start, end };
      selectedRef.current = trimmed;
      setSelectionStart(start);
      setSelectionEnd(end);
      setSelectedText(trimmed);
      setOpen(true);

      const single = isSingleSelectableWord(trimmed);
      if (!single) {
        abortPending();
        setSuggested([]);
        setAllSynonyms([]);
        setShowAllSynonyms(false);
        setIsLoadingSuggestions(false);
        return;
      }

      if (!shouldAutoFetchSuggestions(trimmed)) {
        abortPending();
        setSuggested([]);
        setIsLoadingSuggestions(false);
        return;
      }

      const sentence = sentenceContainingRange(source.text, start, end);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void fetchSuggestions(trimmed, source.text, sentence);
      }, SUGGEST_DEBOUNCE_MS);
    },
    [abortPending, close, fetchSuggestions, open],
  );

  const applyReplacement = useCallback(
    (replacement: string) => {
      const source = sourceRef.current;
      if (!source) return;
      const original = selectedRef.current;
      const cased = preserveReplacementCase(original, replacement);
      const { start, end } = rangeRef.current;
      const next = applyRangeReplacement(source.text, start, end, cased);
      source.onChange(next);
      toast.success(`Replaced "${original}" with "${cased}"`);
      close();
    },
    [close],
  );

  const applyRevision = useCallback(
    (revision: string) => {
      const source = sourceRef.current;
      if (!source) return;
      const { start, end } = rangeRef.current;
      source.onChange(applyRangeReplacement(source.text, start, end, revision));
      toast.success("Selection replaced");
      close();
    },
    [close],
  );

  const showAll = useCallback(async () => {
    const word = selectedRef.current;
    if (!isSingleSelectableWord(word)) return;

    setShowAllSynonyms(true);
    if (allSynonyms.length > 0 || isLoadingAll) return;

    allAbortRef.current?.abort();
    const controller = new AbortController();
    allAbortRef.current = controller;
    setIsLoadingAll(true);

    try {
      const dictionary = await fetchDictionarySynonyms(word, controller.signal);
      const already = new Set(suggested.map((item) => item.toLowerCase()));
      already.add(word.toLowerCase());
      setAllSynonyms(dictionary.filter((item) => !already.has(item.toLowerCase())));
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Dictionary synonym error:", error);
      toast.error("Failed to load all synonyms");
      setAllSynonyms([]);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingAll(false);
      }
    }
  }, [allSynonyms.length, isLoadingAll, suggested]);

  const hideAll = useCallback(() => {
    setShowAllSynonyms(false);
  }, []);

  const reviseSelection = useCallback(
    async (mode: PhraseReviseMode) => {
      const source = sourceRef.current;
      const selected = selectedRef.current;
      if (!source || !selected) return;

      setIsRevising(true);
      setRevisionResults([]);

      try {
        const response = await fetchWithRetry("/api/revise-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullStatement: source.text,
            selectedText: selected,
            selectionStart: rangeRef.current.start,
            selectionEnd: rangeRef.current.end,
            model,
            mode,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (handleUsageLimitResponse(errorData)) return;
          throw new Error(errorData.error || "Revision failed");
        }

        const data = await response.json();
        setRevisionResults(Array.isArray(data.revisions) ? data.revisions : []);
      } catch (error) {
        console.error("Selection revise error:", error);
        toast.error(error instanceof Error ? error.message : "Failed to revise selection");
      } finally {
        setIsRevising(false);
      }
    },
    [model],
  );

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      if (document.activeElement?.closest(".selection-popup")) return;
      if (document.querySelector(".selection-popup[data-loading='true']")) return;
      close();
    }, 200);
  }, [close]);

  const handleKeyDown = useCallback(
    (event: { key: string }) => {
      if (event.key === "Escape" && open) close();
    },
    [close, open],
  );

  return {
    open,
    selectedText,
    selectionStart,
    selectionEnd,
    isSingleWord,
    suggested,
    allSynonyms,
    showAllSynonyms,
    isLoadingSuggestions,
    isLoadingAll,
    revisionResults,
    isRevising,
    enablePhraseRevise,
    handleTextSelect,
    handleBlur,
    handleKeyDown,
    applyReplacement,
    applyRevision,
    showAll,
    hideAll,
    reviseSelection,
    close,
  };
}

export type WordThesaurusApi = ReturnType<typeof useWordThesaurus>;
