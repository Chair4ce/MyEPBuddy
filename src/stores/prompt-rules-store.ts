import { create } from "zustand";
import type { PromptRule, PromptRuleContext } from "@/types/database";

interface PromptRulesState {
  rulesByContext: Partial<Record<PromptRuleContext, PromptRule[]>>;
  isLoading: Partial<Record<PromptRuleContext, boolean>>;
  isSaving: boolean;
  fetchRules: (context: PromptRuleContext) => Promise<void>;
  createRule: (
    context: PromptRuleContext,
    ruleText: string,
  ) => Promise<PromptRule | null>;
  updateRule: (
    id: string,
    context: PromptRuleContext,
    updates: { ruleText?: string; isActive?: boolean; sortOrder?: number },
  ) => Promise<PromptRule | null>;
  deleteRule: (id: string, context: PromptRuleContext) => Promise<boolean>;
  setRulesForContext: (context: PromptRuleContext, rules: PromptRule[]) => void;
}

export const usePromptRulesStore = create<PromptRulesState>((set, get) => ({
  rulesByContext: {},
  isLoading: {},
  isSaving: false,

  setRulesForContext: (context, rules) =>
    set((state) => ({
      rulesByContext: { ...state.rulesByContext, [context]: rules },
    })),

  fetchRules: async (context) => {
    set((state) => ({
      isLoading: { ...state.isLoading, [context]: true },
    }));

    try {
      const res = await fetch(
        `/api/prompt-rules?context=${encodeURIComponent(context)}`,
      );
      if (!res.ok) {
        set((state) => ({
          isLoading: { ...state.isLoading, [context]: false },
        }));
        return;
      }
      const data = (await res.json()) as { rules: PromptRule[] };
      set((state) => ({
        rulesByContext: { ...state.rulesByContext, [context]: data.rules ?? [] },
        isLoading: { ...state.isLoading, [context]: false },
      }));
    } catch {
      set((state) => ({
        isLoading: { ...state.isLoading, [context]: false },
      }));
    }
  },

  createRule: async (context, ruleText) => {
    set({ isSaving: true });
    try {
      const res = await fetch("/api/prompt-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, ruleText, isActive: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create rule");
      }
      const rule = data.rule as PromptRule;
      const existing = get().rulesByContext[context] ?? [];
      set((state) => ({
        rulesByContext: {
          ...state.rulesByContext,
          [context]: [...existing, rule],
        },
        isSaving: false,
      }));
      return rule;
    } catch {
      set({ isSaving: false });
      return null;
    }
  },

  updateRule: async (id, context, updates) => {
    set({ isSaving: true });
    try {
      const res = await fetch("/api/prompt-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update rule");
      }
      const rule = data.rule as PromptRule;
      const existing = get().rulesByContext[context] ?? [];
      set((state) => ({
        rulesByContext: {
          ...state.rulesByContext,
          [context]: existing.map((r) => (r.id === id ? rule : r)),
        },
        isSaving: false,
      }));
      return rule;
    } catch {
      set({ isSaving: false });
      return null;
    }
  },

  deleteRule: async (id, context) => {
    set({ isSaving: true });
    try {
      const res = await fetch("/api/prompt-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        set({ isSaving: false });
        return false;
      }
      const existing = get().rulesByContext[context] ?? [];
      set((state) => ({
        rulesByContext: {
          ...state.rulesByContext,
          [context]: existing.filter((r) => r.id !== id),
        },
        isSaving: false,
      }));
      return true;
    } catch {
      set({ isSaving: false });
      return false;
    }
  },
}));
