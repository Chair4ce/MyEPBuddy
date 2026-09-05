"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { handleUsageLimitResponse } from "@/stores/usage-limit-store";
import {
  applyRangeReplacement,
  isSingleSelectableWord,
  preserveReplacementCase,
  resolveThesaurusDocumentContext,
  sentenceContainingRange,
  shouldAutoFetchSuggestions,
  splitSuggestedAndRest,
  trimSelection,
  type PhraseReviseMode,
  type WordThesaurusDocumentContext,
} from "@/lib/word-thesaurus";
import { formatClarifyingAnswers, sanitizeReviseContext } from "@/lib/revise-rephrase";

const SUGGEST_DEBOUNCE_MS = 280;

export interface ThesaurusTextSource {
  text: string;
  onChange: (next: string) => void;
  /** Full statement the span lives in (e.g. both EPB sentences). Defaults to `text`. */
  contextText?: string;
}

export interface UseWordThesaurusOptions {
  model: string;
  documentContext: WordThesaurusDocumentContext;
  enablePhraseRevise?: boolean;
  /** Duty description highlight-rephrase must stay present-tense / non-performance. */
  isDutyDescription?: boolean;
  /** Field max so highlight rephrase cannot blow the myEval cap. */
  maxCharacters?: number;
}

export function useWordThesaurus({
  model,
  documentContext,
  enablePhraseRevise = true,
  isDutyDescription = false,
  maxCharacters,
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
  const [clarifyingQuestions, setClarifyingQuestions] = useState<string[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<string[]>([]);
  const [rephraseIntent, setRephraseIntent] = useState("");
  const [revisionAnchorText, setRevisionAnchorText] = useState("");
  const [isRevising, setIsRevising] = useState(false);

  const sourceRef = useRef<ThesaurusTextSource | null>(null);
  const rangeRef = useRef({ start: 0, end: 0 });
  const selectedRef = useRef("");
  const suggestAbortRef = useRef<AbortController | null>(null);
  const allAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const suggestionKeyRef = useRef("");
  const pinnedRevisionsRef = useRef(false);
  const pinnedApplyRef = useRef<{
    source: ThesaurusTextSource;
    start: number;
    end: number;
  } | null>(null);

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
    setClarifyingQuestions([]);
    setQuestionAnswers([]);
    setRephraseIntent("");
    setRevisionAnchorText("");
    pinnedRevisionsRef.current = false;
    pinnedApplyRef.current = null;
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
        setIsLoadingSuggestions(false);
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
        if (open && !pinnedRevisionsRef.current) close();
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
        void fetchSuggestions(
          trimmed,
          source.contextText?.trim() ? source.contextText : source.text,
          sentence,
        );
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
      const pin = pinnedApplyRef.current;
      const source = pin?.source ?? sourceRef.current;
      if (!source) return;
      const start = pin?.start ?? rangeRef.current.start;
      const end = pin?.end ?? rangeRef.current.end;
      const next = applyRangeReplacement(source.text, start, end, revision);
      source.onChange(next);
      const nextSource = { ...source, text: next };
      const nextEnd = start + revision.length;
      if (pin) {
        pinnedApplyRef.current = { source: nextSource, start, end: nextEnd };
      }
      const sameField = sourceRef.current?.onChange === source.onChange;
      if (sameField) {
        sourceRef.current = nextSource;
        rangeRef.current = { start, end: nextEnd };
        selectedRef.current = revision;
        setSelectedText(revision);
        setSelectionStart(start);
        setSelectionEnd(nextEnd);
      }
      toast.success("Selection replaced");
    },
    [],
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
      const response = await fetch(
        `/api/dictionary-synonyms?word=${encodeURIComponent(word)}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch dictionary synonyms");
      }
      const data = await response.json();
      const dictionary: string[] = Array.isArray(data.synonyms) ? data.synonyms : [];
      const already = new Set(suggested.map((item) => item.toLowerCase()));
      already.add(word.toLowerCase());
      setAllSynonyms(dictionary.filter((item) => !already.has(item.toLowerCase())));
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Dictionary synonym error:", error);
      toast.error("Failed to load all synonyms");
      setAllSynonyms([]);
    } finally {
      setIsLoadingAll(false);
    }
  }, [allSynonyms.length, isLoadingAll, suggested]);

  const hideAll = useCallback(() => {
    setShowAllSynonyms(false);
  }, []);

  const setQuestionAnswerAt = useCallback((index: number, value: string) => {
    setQuestionAnswers((current) => {
      if (index < 0) return current;
      if (index < current.length) {
        return current.map((item, i) => (i === index ? value : item));
      }
      return [...current, ...Array.from({ length: index - current.length }, () => ""), value];
    });
  }, []);

  const reviseSelection = useCallback(
    async (mode: PhraseReviseMode) => {
      const source = sourceRef.current;
      const selected = selectedRef.current;
      if (!source || !selected) return;

      setIsRevising(true);
      setRevisionResults([]);
      setClarifyingQuestions([]);

      const answerContext = formatClarifyingAnswers(
        clarifyingQuestions,
        questionAnswers,
      );
      const context = sanitizeReviseContext(
        [rephraseIntent, answerContext].filter(Boolean).join(" "),
      );

      const document = resolveThesaurusDocumentContext({
        fieldText: source.text,
        fieldStart: rangeRef.current.start,
        fieldEnd: rangeRef.current.end,
        contextText: source.contextText,
      });

      try {
        const response = await fetchWithRetry("/api/revise-selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullStatement: document.fullStatement,
            selectedText: selected,
            selectionStart: document.selectionStart,
            selectionEnd: document.selectionEnd,
            model,
            mode,
            context: context || undefined,
            isDutyDescription,
            maxCharacters,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (handleUsageLimitResponse(errorData)) return;
          throw new Error(errorData.error || "Revision failed");
        }

        const data = await response.json();
        const nextRevisions = Array.isArray(data.revisions) ? data.revisions : [];
        setRevisionResults(nextRevisions);
        if (nextRevisions.length > 0) {
          pinnedRevisionsRef.current = true;
          pinnedApplyRef.current = {
            source: { ...source, text: source.text },
            start: rangeRef.current.start,
            end: rangeRef.current.end,
          };
          setRevisionAnchorText(selected);
          setOpen(true);
        }
        const nextQuestions = Array.isArray(data.questions)
          ? data.questions.filter((item: unknown): item is string => typeof item === "string")
          : [];
        setClarifyingQuestions(nextQuestions);
        setQuestionAnswers((current) =>
          nextQuestions.map((_question: string, index: number) => current[index] ?? ""),
        );
      } catch (error) {
        console.error("Selection revise error:", error);
        toast.error(error instanceof Error ? error.message : "Failed to revise selection");
      } finally {
        setIsRevising(false);
      }
    },
    [
      clarifyingQuestions,
      isDutyDescription,
      maxCharacters,
      model,
      questionAnswers,
      rephraseIntent,
    ],
  );

  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      if (document.activeElement?.closest(".selection-popup")) return;
      if (document.querySelector(".selection-popup[data-loading='true']")) return;
      if (pinnedRevisionsRef.current) return;
      close();
    }, 200);
  }, [close]);

  const handleKeyDown = useCallback(
    (event: { key: string }) => {
      if (event.key === "Escape" && (open || pinnedRevisionsRef.current)) close();
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
    revisionAnchorText,
    clarifyingQuestions,
    questionAnswers,
    rephraseIntent,
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
    setRephraseIntent,
    setQuestionAnswerAt,
    close,
  };
}

export type WordThesaurusApi = ReturnType<typeof useWordThesaurus>;
