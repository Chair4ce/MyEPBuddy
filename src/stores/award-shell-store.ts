import { create } from "zustand";
import type { AwardShell, AwardShellSection, AwardShellSnapshot, Rank, AwardLevel, AwardCategory } from "@/types/database";

// Source type for statement generation
export type SourceType = "actions" | "custom";

// Local state for each section slot (not persisted to DB)
export interface SectionSlotState {
  draftText: string;
  isDirty: boolean;
  isGenerating: boolean;
  isRevising: boolean;
  isSaving: boolean;
  
  // Source toggle
  sourceType: SourceType;
  
  // Custom context (if sourceType is 'custom')
  customContext: string;
  
  // Selected action IDs (if sourceType is 'actions')
  selectedActionIds: string[];
  
  // Lines per statement (2 or 3) - per-slot setting
  linesPerStatement: 2 | 3;
}

// Ratee info for the selected member
export interface SelectedNominee {
  id: string;
  fullName: string | null;
  rank: Rank | null;
  afsc: string | null;
  isManagedMember: boolean;
}

interface AwardShellState {
  // Current selected nominee (self or subordinate)
  selectedNominee: SelectedNominee | null;
  
  // The loaded Award shell for the selected nominee/cycle
  currentShell: AwardShell | null;
  
  // Sections indexed by category and slot_index for quick access
  // Key format: `${category}:${slot_index}`
  sections: Record<string, AwardShellSection>;
  
  // Snapshots indexed by section ID
  snapshots: Record<string, AwardShellSnapshot[]>;
  
  // Local UI state for each section slot
  // Key format: `${category}:${slot_index}`
  slotStates: Record<string, SectionSlotState>;
  
  // Collapsed state for each category
  collapsedCategories: Record<string, boolean>;
  
  // Award configuration
  awardLevel: AwardLevel;
  awardCategory: AwardCategory;
  sentencesPerStatement: 2 | 3;
  
  // Loading states
  isLoadingShell: boolean;
  isCreatingShell: boolean;
  
  // AI model selection
  selectedModel: string;
  
  // Actions
  setSelectedNominee: (nominee: SelectedNominee | null) => void;
  setCurrentShell: (shell: AwardShell | null) => void;
  setSections: (sections: AwardShellSection[]) => void;
  updateSection: (category: string, slotIndex: number, updates: Partial<AwardShellSection>) => void;
  addSection: (category: string) => AwardShellSection;
  removeSection: (category: string, slotIndex: number) => void;
  setSnapshots: (sectionId: string, snapshots: AwardShellSnapshot[]) => void;
  addSnapshot: (sectionId: string, snapshot: AwardShellSnapshot) => void;
  
  // Slot state management
  getSlotState: (category: string, slotIndex: number) => SectionSlotState;
  updateSlotState: (category: string, slotIndex: number, updates: Partial<SectionSlotState>) => void;
  initializeSlotState: (category: string, slotIndex: number, section: AwardShellSection) => void;
  
  // Collapsed state management
  toggleCategoryCollapsed: (category: string) => void;
  setCategoryCollapsed: (category: string, collapsed: boolean) => void;
  expandAll: () => void;
  collapseAll: () => void;
  
  // Award configuration
  setAwardLevel: (level: AwardLevel) => void;
  setAwardCategory: (category: AwardCategory) => void;
  setSentencesPerStatement: (count: 2 | 3) => void;
  setSelectedModel: (model: string) => void;
  
  // Loading states
  setIsLoadingShell: (loading: boolean) => void;
  setIsCreatingShell: (creating: boolean) => void;
  
  // Get all statements for preview
  getAllStatements: () => { category: string; slotIndex: number; text: string }[];
  
  // Reset
  reset: () => void;
}

const getDefaultSlotState = (): SectionSlotState => ({
  draftText: "",
  isDirty: false,
  isGenerating: false,
  isRevising: false,
  isSaving: false,
  sourceType: "actions",
  customContext: "",
  selectedActionIds: [],
  linesPerStatement: 2,
});

const getSectionKey = (category: string, slotIndex: number) => `${category}:${slotIndex}`;

export const useAwardShellStore = create<AwardShellState>((set, get) => ({
  selectedNominee: null,
  currentShell: null,
  sections: {},
  snapshots: {},
  slotStates: {},
  collapsedCategories: {},
  awardLevel: "squadron",
  awardCategory: "amn",
  sentencesPerStatement: 2,
  isLoadingShell: false,
  isCreatingShell: false,
  selectedModel: "gemini-2.0-flash",
  
  setSelectedNominee: (nominee) => set({ selectedNominee: nominee }),
  
  setCurrentShell: (shell) => {
    if (shell) {
      set({
        currentShell: shell,
        awardLevel: shell.award_level,
        awardCategory: shell.award_category,
        sentencesPerStatement: shell.sentences_per_statement,
      });
    } else {
      set({ currentShell: null });
    }
  },
  
  setSections: (sections) => {
    const sectionsMap: Record<string, AwardShellSection> = {};
    const slotStatesMap: Record<string, SectionSlotState> = {};
    
    sections.forEach((section) => {
      const key = getSectionKey(section.category, section.slot_index);
      sectionsMap[key] = section;
      slotStatesMap[key] = {
        draftText: section.statement_text || "",
        isDirty: false,
        isGenerating: false,
        isRevising: false,
        isSaving: false,
        sourceType: section.source_type || "actions",
        customContext: section.custom_context || "",
        selectedActionIds: section.selected_action_ids || [],
        linesPerStatement: section.lines_per_statement || 2,
      };
    });
    
    set({ sections: sectionsMap, slotStates: slotStatesMap });
  },
  
  updateSection: (category, slotIndex, updates) => {
    const key = getSectionKey(category, slotIndex);
    set((state) => ({
      sections: {
        ...state.sections,
        [key]: state.sections[key] ? { ...state.sections[key], ...updates } : state.sections[key],
      },
    }));
  },
  
  addSection: (category) => {
    const state = get();
    // Find the next slot index for this category
    const existingSlots = Object.keys(state.sections)
      .filter((key) => key.startsWith(`${category}:`))
      .map((key) => parseInt(key.split(":")[1]));
    const nextSlotIndex = existingSlots.length > 0 ? Math.max(...existingSlots) + 1 : 0;
    
    const newSection: AwardShellSection = {
      id: `temp-${Date.now()}`, // Temporary ID until saved
      shell_id: state.currentShell?.id || "",
      category,
      slot_index: nextSlotIndex,
      statement_text: "",
      source_type: "actions",
      custom_context: "",
      selected_action_ids: [],
      lines_per_statement: state.sentencesPerStatement,
      last_edited_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const key = getSectionKey(category, nextSlotIndex);
    set((state) => ({
      sections: { ...state.sections, [key]: newSection },
      slotStates: { ...state.slotStates, [key]: getDefaultSlotState() },
    }));
    
    return newSection;
  },
  
  removeSection: (category, slotIndex) => {
    const key = getSectionKey(category, slotIndex);
    set((state) => {
      const newSections = { ...state.sections };
      const newSlotStates = { ...state.slotStates };
      delete newSections[key];
      delete newSlotStates[key];
      return { sections: newSections, slotStates: newSlotStates };
    });
  },
  
  setSnapshots: (sectionId, snapshots) => {
    set((state) => ({
      snapshots: { ...state.snapshots, [sectionId]: snapshots },
    }));
  },
  
  addSnapshot: (sectionId, snapshot) => {
    set((state) => ({
      snapshots: {
        ...state.snapshots,
        [sectionId]: [snapshot, ...(state.snapshots[sectionId] || [])],
      },
    }));
  },
  
  getSlotState: (category, slotIndex) => {
    const key = getSectionKey(category, slotIndex);
    return get().slotStates[key] || getDefaultSlotState();
  },
  
  updateSlotState: (category, slotIndex, updates) => {
    const key = getSectionKey(category, slotIndex);
    set((state) => ({
      slotStates: {
        ...state.slotStates,
        [key]: { ...(state.slotStates[key] || getDefaultSlotState()), ...updates },
      },
    }));
  },
  
  initializeSlotState: (category, slotIndex, section) => {
    const key = getSectionKey(category, slotIndex);
    set((state) => ({
      slotStates: {
        ...state.slotStates,
        [key]: {
          draftText: section.statement_text,
          isDirty: false,
          isGenerating: false,
          isRevising: false,
          isSaving: false,
          sourceType: section.source_type,
          customContext: section.custom_context,
          selectedActionIds: section.selected_action_ids || [],
          linesPerStatement: section.lines_per_statement || 2,
        },
      },
    }));
  },
  
  toggleCategoryCollapsed: (category) => {
    set((state) => ({
      collapsedCategories: {
        ...state.collapsedCategories,
        [category]: !state.collapsedCategories[category],
      },
    }));
  },
  
  setCategoryCollapsed: (category, collapsed) => {
    set((state) => ({
      collapsedCategories: { ...state.collapsedCategories, [category]: collapsed },
    }));
  },
  
  expandAll: () => {
    set((state) => {
      const collapsed: Record<string, boolean> = {};
      Object.keys(state.collapsedCategories).forEach((key) => {
        collapsed[key] = false;
      });
      return { collapsedCategories: collapsed };
    });
  },
  
  collapseAll: () => {
    set((state) => {
      const collapsed: Record<string, boolean> = {};
      Object.keys(state.sections).forEach((key) => {
        const category = key.split(":")[0];
        collapsed[category] = true;
      });
      return { collapsedCategories: collapsed };
    });
  },
  
  setAwardLevel: (level) => set({ awardLevel: level }),
  setAwardCategory: (category) => set({ awardCategory: category }),
  setSentencesPerStatement: (count) => set({ sentencesPerStatement: count }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  
  setIsLoadingShell: (loading) => set({ isLoadingShell: loading }),
  setIsCreatingShell: (creating) => set({ isCreatingShell: creating }),
  
  getAllStatements: () => {
    const state = get();
    const statements: { category: string; slotIndex: number; text: string }[] = [];
    
    Object.entries(state.slotStates).forEach(([key, slotState]) => {
      const [category, slotIndexStr] = key.split(":");
      const slotIndex = parseInt(slotIndexStr);
      if (slotState.draftText.trim()) {
        statements.push({ category, slotIndex, text: slotState.draftText.trim() });
      }
    });
    
    // Sort by category then slot index
    statements.sort((a, b) => {
      if (a.category !== b.category) {
        const order = ["leadership_job_performance", "significant_self_improvement", "base_community_involvement"];
        return order.indexOf(a.category) - order.indexOf(b.category);
      }
      return a.slotIndex - b.slotIndex;
    });
    
    return statements;
  },
  
  reset: () => set({
    selectedNominee: null,
    currentShell: null,
    sections: {},
    snapshots: {},
    slotStates: {},
    collapsedCategories: {},
    awardLevel: "squadron",
    awardCategory: "amn",
    sentencesPerStatement: 2,
    isLoadingShell: false,
    isCreatingShell: false,
  }),
}));

