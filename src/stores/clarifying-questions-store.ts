/**
 * Clarifying Questions Store
 * 
 * Non-persistent session store for managing LLM-generated clarifying questions.
 * These questions help improve statement quality by gathering missing context.
 * 
 * Flow:
 * 1. LLM generates statements + optional clarifying questions
 * 2. Questions stored in this session store (not persisted to DB)
 * 3. UI shows indicator when questions are available
 * 4. User can answer questions and regenerate with enhanced context
 */

import { create } from "zustand";

/**
 * A single clarifying question from the LLM
 */
export interface ClarifyingQuestion {
  id: string;
  /** The question text */
  question: string;
  /** Category of the question for grouping */
  category: "impact" | "scope" | "leadership" | "recognition" | "metrics" | "general";
  /** User's answer (empty string if not answered) */
  answer: string;
  /** Hint text to help user understand what kind of answer is helpful */
  hint?: string;
  /** Which sentence this question relates to (1, 2, or undefined for general/both) */
  sentenceNumber?: 1 | 2;
}

/**
 * Source context information for clarifying questions
 * Shows the user what input generated these questions
 */
export interface QuestionSourceContext {
  /** The input text for statement 1 */
  statement1Input?: string;
  /** The input text for statement 2 (if applicable) */
  statement2Input?: string;
  /** The generated text for statement 1 */
  statement1Generated?: string;
  /** The generated text for statement 2 (if applicable) */
  statement2Generated?: string;
  /** Human-readable MPA label (e.g., "Job Performance") */
  mpaLabel?: string;
}

/**
 * A set of questions for a specific MPA or generation context
 */
export interface QuestionSet {
  /** Unique ID for this question set */
  id: string;
  /** The MPA key this relates to (e.g., "job_perf", "leadership") */
  mpaKey: string;
  /** The ratee ID these questions are for */
  rateeId: string;
  /** Timestamp when questions were generated */
  createdAt: Date;
  /** The original prompt/context that generated these questions */
  originalContext?: string;
  /** Source context showing what input/output triggered these questions */
  sourceContext?: QuestionSourceContext;
  /** The questions themselves */
  questions: ClarifyingQuestion[];
  /** Additional context the user wants to add (free-form) */
  additionalContext: string;
  /** Whether user has interacted with these questions */
  hasBeenViewed: boolean;
}

interface ClarifyingQuestionsState {
  /** Map of question sets by their ID */
  questionSets: Map<string, QuestionSet>;
  
  /** Currently active question set ID (for modal display) */
  activeQuestionSetId: string | null;
  
  /** Whether the modal is open */
  isModalOpen: boolean;
  
  // Actions
  
  /** Add a new question set from LLM response */
  addQuestionSet: (questionSet: Omit<QuestionSet, "id" | "createdAt" | "hasBeenViewed" | "additionalContext"> & { sourceContext?: QuestionSourceContext }) => string;
  
  /** Get questions for a specific MPA and ratee */
  getQuestionsForMPA: (mpaKey: string, rateeId: string) => QuestionSet | undefined;
  
  /** Check if there are unanswered questions for a MPA/ratee */
  hasUnansweredQuestions: (mpaKey: string, rateeId: string) => boolean;
  
  /** Get count of question sets with unanswered questions for a ratee */
  getUnansweredCount: (rateeId: string) => number;
  
  /** Update an answer for a specific question */
  updateAnswer: (questionSetId: string, questionId: string, answer: string) => void;
  
  /** Update additional context for a question set */
  updateAdditionalContext: (questionSetId: string, context: string) => void;
  
  /** Mark a question set as viewed */
  markAsViewed: (questionSetId: string) => void;
  
  /** Remove a question set (after regeneration or dismissal) */
  removeQuestionSet: (questionSetId: string) => void;
  
  /** Clear all questions for a specific ratee */
  clearQuestionsForRatee: (rateeId: string) => void;
  
  /** Open the modal for a specific question set */
  openModal: (questionSetId: string) => void;
  
  /** Close the modal */
  closeModal: () => void;
  
  /** Get the active question set */
  getActiveQuestionSet: () => QuestionSet | undefined;
  
  /** Build context string from answered questions for regeneration */
  buildClarifyingContext: (questionSetId: string) => string;
  
  /** Reset entire store */
  reset: () => void;
}

// Helper to generate unique IDs
const generateId = () => `cq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useClarifyingQuestionsStore = create<ClarifyingQuestionsState>((set, get) => ({
  questionSets: new Map(),
  activeQuestionSetId: null,
  isModalOpen: false,
  
  addQuestionSet: (questionSetData) => {
    const id = generateId();
    const questionSet: QuestionSet = {
      ...questionSetData,
      id,
      createdAt: new Date(),
      hasBeenViewed: false,
      additionalContext: "",
      sourceContext: questionSetData.sourceContext,
      questions: questionSetData.questions.map(q => ({
        ...q,
        id: q.id || generateId(),
        answer: "",
      })),
    };
    
    set((state) => {
      const newMap = new Map(state.questionSets);
      // Remove any existing questions for this MPA/ratee combo
      for (const [existingId, existing] of newMap) {
        if (existing.mpaKey === questionSetData.mpaKey && existing.rateeId === questionSetData.rateeId) {
          newMap.delete(existingId);
        }
      }
      newMap.set(id, questionSet);
      return { questionSets: newMap };
    });
    
    return id;
  },
  
  getQuestionsForMPA: (mpaKey, rateeId) => {
    const { questionSets } = get();
    for (const qs of questionSets.values()) {
      if (qs.mpaKey === mpaKey && qs.rateeId === rateeId) {
        return qs;
      }
    }
    return undefined;
  },
  
  hasUnansweredQuestions: (mpaKey, rateeId) => {
    const qs = get().getQuestionsForMPA(mpaKey, rateeId);
    if (!qs) return false;
    return qs.questions.length > 0;
  },
  
  getUnansweredCount: (rateeId) => {
    const { questionSets } = get();
    let count = 0;
    for (const qs of questionSets.values()) {
      if (qs.rateeId === rateeId && qs.questions.length > 0) {
        count++;
      }
    }
    return count;
  },
  
  updateAnswer: (questionSetId, questionId, answer) => {
    set((state) => {
      const newMap = new Map(state.questionSets);
      const qs = newMap.get(questionSetId);
      if (qs) {
        const updatedQuestions = qs.questions.map(q => 
          q.id === questionId ? { ...q, answer } : q
        );
        newMap.set(questionSetId, { ...qs, questions: updatedQuestions });
      }
      return { questionSets: newMap };
    });
  },
  
  updateAdditionalContext: (questionSetId, context) => {
    set((state) => {
      const newMap = new Map(state.questionSets);
      const qs = newMap.get(questionSetId);
      if (qs) {
        newMap.set(questionSetId, { ...qs, additionalContext: context });
      }
      return { questionSets: newMap };
    });
  },
  
  markAsViewed: (questionSetId) => {
    set((state) => {
      const newMap = new Map(state.questionSets);
      const qs = newMap.get(questionSetId);
      if (qs) {
        newMap.set(questionSetId, { ...qs, hasBeenViewed: true });
      }
      return { questionSets: newMap };
    });
  },
  
  removeQuestionSet: (questionSetId) => {
    set((state) => {
      const newMap = new Map(state.questionSets);
      newMap.delete(questionSetId);
      return { 
        questionSets: newMap,
        activeQuestionSetId: state.activeQuestionSetId === questionSetId ? null : state.activeQuestionSetId,
        isModalOpen: state.activeQuestionSetId === questionSetId ? false : state.isModalOpen,
      };
    });
  },
  
  clearQuestionsForRatee: (rateeId) => {
    set((state) => {
      const newMap = new Map(state.questionSets);
      for (const [id, qs] of newMap) {
        if (qs.rateeId === rateeId) {
          newMap.delete(id);
        }
      }
      return { questionSets: newMap };
    });
  },
  
  openModal: (questionSetId) => {
    const qs = get().questionSets.get(questionSetId);
    if (qs) {
      set({ activeQuestionSetId: questionSetId, isModalOpen: true });
      // Mark as viewed
      get().markAsViewed(questionSetId);
    }
  },
  
  closeModal: () => {
    set({ isModalOpen: false, activeQuestionSetId: null });
  },
  
  getActiveQuestionSet: () => {
    const { activeQuestionSetId, questionSets } = get();
    if (!activeQuestionSetId) return undefined;
    return questionSets.get(activeQuestionSetId);
  },
  
  buildClarifyingContext: (questionSetId) => {
    const qs = get().questionSets.get(questionSetId);
    if (!qs) return "";
    
    const parts: string[] = [];
    
    // Add answered questions
    const answeredQuestions = qs.questions.filter(q => q.answer.trim().length > 0);
    if (answeredQuestions.length > 0) {
      parts.push("=== CLARIFYING INFORMATION FROM USER ===");
      answeredQuestions.forEach(q => {
        parts.push(`Q: ${q.question}`);
        parts.push(`A: ${q.answer}`);
        parts.push("");
      });
    }
    
    // Add additional context
    if (qs.additionalContext.trim().length > 0) {
      parts.push("=== ADDITIONAL CONTEXT FROM USER ===");
      parts.push(qs.additionalContext);
    }
    
    return parts.join("\n");
  },
  
  reset: () => {
    set({
      questionSets: new Map(),
      activeQuestionSetId: null,
      isModalOpen: false,
    });
  },
}));

/**
 * Question category labels for display
 */
export const QUESTION_CATEGORY_LABELS: Record<ClarifyingQuestion["category"], string> = {
  impact: "Impact & Results",
  scope: "Scope & Reach",
  leadership: "Leadership & Team",
  recognition: "Recognition & Selection",
  metrics: "Numbers & Metrics",
  general: "General",
};

/**
 * Default clarifying question prompts for the LLM
 */
export const CLARIFYING_QUESTION_GUIDANCE = `
=== OPTIONAL: CLARIFYING QUESTIONS ===
If the provided information is missing key details that would significantly enhance the statement quality, you may include 1-3 clarifying questions. These are OPTIONAL and non-blocking.

Consider asking about:

**IMPACT (Category: "impact")**
- Did this accomplishment save time, money, or resources? If so, how much?
- What was the "so what?" - why did this matter and to whom?
- What would have happened if this wasn't done?

**SCOPE (Category: "scope")**  
- Did this work affect just the immediate unit, or did it reach higher levels (Group, Wing, Base, MAJCOM, HAF)?
- How many people/units/missions were affected by this work?
- Was this accomplishment outside the normal scope of their assigned duties?

**LEADERSHIP (Category: "leadership")**
- Did they lead a team? If so, how many people?
- Was the team size larger than what's described in their duty description?
- Did they mentor, train, or develop others?

**RECOGNITION (Category: "recognition")**
- Were they hand-selected for this task? If so, by whom and why?
- Was this a competitive selection or volunteer opportunity?
- Did they receive any awards or recognition for this work?

**METRICS (Category: "metrics")**
- Can any results be quantified (percentages, dollar amounts, time saved, people served)?
- What's the comparison point (e.g., "50% faster than standard" or "first ever in unit")?

If you have clarifying questions, include them in a separate JSON field. Format:
{
  "statements": [...],
  "clarifyingQuestions": [
    {
      "question": "The question text",
      "category": "impact|scope|leadership|recognition|metrics|general",
      "hint": "Brief hint on what kind of answer would help"
    }
  ]
}

Only ask questions when the answer would SIGNIFICANTLY improve the statement. Do not ask questions just to ask them.
`;
