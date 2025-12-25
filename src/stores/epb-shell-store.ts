import { create } from "zustand";
import type { EPBShell, EPBShellSection, EPBShellSnapshot, EPBSavedExample, Rank } from "@/types/database";

// MPA workspace mode for each section
export type MPAWorkspaceMode = "view" | "edit" | "ai-assist";

// Source type for statement generation
export type SourceType = "actions" | "custom";

// Local state for each MPA section (not persisted to DB)
export interface MPASectionState {
  mode: MPAWorkspaceMode;
  draftText: string;
  isDirty: boolean;
  isGenerating: boolean;
  isRevising: boolean;
  isSaving: boolean;
  showHistory: boolean;
  
  // Source toggle
  sourceType: SourceType;
  
  // Loaded actions (cartridges)
  statement1ActionIds: string[]; // Actions for statement 1 (or single statement)
  statement2ActionIds: string[]; // Actions for statement 2 (two-statement mode)
  actionsExpanded: boolean; // Whether loaded actions panel is expanded
  
  // For two-statement generation
  usesTwoStatements: boolean;
  statement1Context: string; // Custom context for statement 1
  statement2Context: string; // Custom context for statement 2
  
  // Legacy - keeping for backwards compatibility
  selectedAccomplishmentIds: string[];
}

// Ratee info for the selected member
export interface SelectedRatee {
  id: string;
  fullName: string | null;
  rank: Rank | null;
  afsc: string | null;
  isManagedMember: boolean;
}

interface EPBShellState {
  // Current selected ratee (self or subordinate)
  selectedRatee: SelectedRatee | null;
  
  // The loaded EPB shell for the selected ratee/cycle
  currentShell: EPBShell | null;
  
  // Sections indexed by MPA key for quick access
  sections: Record<string, EPBShellSection>;
  
  // Snapshots indexed by section ID
  snapshots: Record<string, EPBShellSnapshot[]>;
  
  // Saved examples indexed by section ID
  savedExamples: Record<string, EPBSavedExample[]>;
  
  // Local UI state for each MPA section
  sectionStates: Record<string, MPASectionState>;
  
  // Collapsed state for each MPA section
  collapsedSections: Record<string, boolean>;
  
  // Loading states
  isLoadingShell: boolean;
  isCreatingShell: boolean;
  
  // Autosave debounce tracking
  autosaveTimers: Record<string, NodeJS.Timeout | null>;
  
  // Actions
  setSelectedRatee: (ratee: SelectedRatee | null) => void;
  setCurrentShell: (shell: EPBShell | null) => void;
  setSections: (sections: EPBShellSection[]) => void;
  updateSection: (mpa: string, updates: Partial<EPBShellSection>) => void;
  setSnapshots: (sectionId: string, snapshots: EPBShellSnapshot[]) => void;
  addSnapshot: (sectionId: string, snapshot: EPBShellSnapshot) => void;
  setSavedExamples: (sectionId: string, examples: EPBSavedExample[]) => void;
  addSavedExample: (sectionId: string, example: EPBSavedExample) => void;
  removeSavedExample: (sectionId: string, exampleId: string) => void;
  
  // Section state management
  getSectionState: (mpa: string) => MPASectionState;
  updateSectionState: (mpa: string, updates: Partial<MPASectionState>) => void;
  initializeSectionState: (mpa: string, currentText: string) => void;
  resetSectionState: (mpa: string) => void;
  
  // Collapsed state management
  toggleSectionCollapsed: (mpa: string) => void;
  setSectionCollapsed: (mpa: string, collapsed: boolean) => void;
  setAllCollapsedSections: (collapsedSections: Record<string, boolean>) => void;
  expandAll: () => void;
  collapseAll: () => void;
  
  // Bulk state updates for collaboration sync
  syncRemoteState: (sections: Record<string, { draftText: string; mode: string }>, collapsedSections: Record<string, boolean>) => void;
  
  // Loading states
  setIsLoadingShell: (loading: boolean) => void;
  setIsCreatingShell: (creating: boolean) => void;
  
  // Autosave management
  setAutosaveTimer: (mpa: string, timer: NodeJS.Timeout | null) => void;
  clearAutosaveTimer: (mpa: string) => void;
  
  // Reset
  reset: () => void;
}

const getDefaultSectionState = (): MPASectionState => ({
  mode: "view",
  draftText: "",
  isDirty: false,
  isGenerating: false,
  isRevising: false,
  isSaving: false,
  showHistory: false,
  
  // Source toggle (default to actions)
  sourceType: "actions",
  
  // Loaded actions
  statement1ActionIds: [],
  statement2ActionIds: [],
  actionsExpanded: true,
  
  // Two-statement mode
  usesTwoStatements: false,
  statement1Context: "",
  statement2Context: "",
  
  // Legacy
  selectedAccomplishmentIds: [],
});

export const useEPBShellStore = create<EPBShellState>((set, get) => ({
  selectedRatee: null,
  currentShell: null,
  sections: {},
  snapshots: {},
  savedExamples: {},
  sectionStates: {},
  collapsedSections: {},
  isLoadingShell: false,
  isCreatingShell: false,
  autosaveTimers: {},

  setSelectedRatee: (ratee) => {
    // Clear autosave timers when switching members
    const timers = get().autosaveTimers;
    Object.values(timers).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });

    // Reset section states and shell when switching members
    set({
      selectedRatee: ratee,
      sectionStates: {},
      autosaveTimers: {},
      // Don't clear the shell here - let the loadShell effect handle it
    });
  },
  
  setCurrentShell: (shell) => {
    set({ currentShell: shell });
    // Initialize sections from shell
    if (shell?.sections) {
      const sectionsMap: Record<string, EPBShellSection> = {};
      shell.sections.forEach((s) => {
        sectionsMap[s.mpa] = s;
      });
      set({ sections: sectionsMap });
    } else {
      set({ sections: {} });
    }
  },

  setSections: (sections) => {
    const sectionsMap: Record<string, EPBShellSection> = {};
    sections.forEach((s) => {
      sectionsMap[s.mpa] = s;
    });
    set({ sections: sectionsMap });
  },

  updateSection: (mpa, updates) =>
    set((state) => ({
      sections: {
        ...state.sections,
        [mpa]: state.sections[mpa]
          ? { ...state.sections[mpa], ...updates }
          : { ...updates, mpa } as EPBShellSection,
      },
    })),

  setSnapshots: (sectionId, snapshots) =>
    set((state) => ({
      snapshots: {
        ...state.snapshots,
        [sectionId]: snapshots,
      },
    })),

  addSnapshot: (sectionId, snapshot) =>
    set((state) => ({
      snapshots: {
        ...state.snapshots,
        [sectionId]: [snapshot, ...(state.snapshots[sectionId] || [])],
      },
    })),

  setSavedExamples: (sectionId, examples) =>
    set((state) => ({
      savedExamples: {
        ...state.savedExamples,
        [sectionId]: examples,
      },
    })),

  addSavedExample: (sectionId, example) =>
    set((state) => ({
      savedExamples: {
        ...state.savedExamples,
        [sectionId]: [example, ...(state.savedExamples[sectionId] || [])],
      },
    })),

  removeSavedExample: (sectionId, exampleId) =>
    set((state) => ({
      savedExamples: {
        ...state.savedExamples,
        [sectionId]: (state.savedExamples[sectionId] || []).filter(e => e.id !== exampleId),
      },
    })),

  getSectionState: (mpa) => {
    const state = get().sectionStates[mpa];
    return state || getDefaultSectionState();
  },

  updateSectionState: (mpa, updates) =>
    set((state) => ({
      sectionStates: {
        ...state.sectionStates,
        [mpa]: {
          ...(state.sectionStates[mpa] || getDefaultSectionState()),
          ...updates,
        },
      },
    })),

  initializeSectionState: (mpa, currentText) =>
    set((state) => ({
      sectionStates: {
        ...state.sectionStates,
        [mpa]: {
          ...getDefaultSectionState(),
          draftText: currentText,
        },
      },
    })),

  resetSectionState: (mpa) =>
    set((state) => {
      const currentText = state.sections[mpa]?.statement_text || "";
      return {
        sectionStates: {
          ...state.sectionStates,
          [mpa]: {
            ...getDefaultSectionState(),
            draftText: currentText,
          },
        },
      };
    }),

  toggleSectionCollapsed: (mpa) =>
    set((state) => ({
      collapsedSections: {
        ...state.collapsedSections,
        [mpa]: !state.collapsedSections[mpa],
      },
    })),

  setSectionCollapsed: (mpa, collapsed) =>
    set((state) => ({
      collapsedSections: {
        ...state.collapsedSections,
        [mpa]: collapsed,
      },
    })),

  expandAll: () => set({ collapsedSections: {} }),

  collapseAll: () =>
    set((state) => {
      const collapsed: Record<string, boolean> = {};
      Object.keys(state.sections).forEach((mpa) => {
        collapsed[mpa] = true;
      });
      return { collapsedSections: collapsed };
    }),

  setAllCollapsedSections: (collapsedSections) =>
    set({ collapsedSections }),

  // Sync remote state from collaboration - updates section drafts and collapsed state
  syncRemoteState: (remoteSections, remoteCollapsedSections) =>
    set((state) => {
      const newSectionStates = { ...state.sectionStates };
      
      // Update each section's draft text and mode from remote
      Object.entries(remoteSections).forEach(([mpa, remote]) => {
        const existing = newSectionStates[mpa] || getDefaultSectionState();
        newSectionStates[mpa] = {
          ...existing,
          draftText: remote.draftText,
          mode: remote.mode as MPAWorkspaceMode,
        };
      });
      
      return {
        sectionStates: newSectionStates,
        collapsedSections: { ...state.collapsedSections, ...remoteCollapsedSections },
      };
    }),

  setIsLoadingShell: (loading) => set({ isLoadingShell: loading }),
  setIsCreatingShell: (creating) => set({ isCreatingShell: creating }),

  setAutosaveTimer: (mpa, timer) =>
    set((state) => ({
      autosaveTimers: {
        ...state.autosaveTimers,
        [mpa]: timer,
      },
    })),

  clearAutosaveTimer: (mpa) => {
    const timer = get().autosaveTimers[mpa];
    if (timer) {
      clearTimeout(timer);
    }
    set((state) => ({
      autosaveTimers: {
        ...state.autosaveTimers,
        [mpa]: null,
      },
    }));
  },

  reset: () => {
    // Clear all autosave timers
    const timers = get().autosaveTimers;
    Object.values(timers).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });

    set({
      selectedRatee: null,
      currentShell: null,
      sections: {},
      snapshots: {},
      savedExamples: {},
      sectionStates: {},
      collapsedSections: {},
      isLoadingShell: false,
      isCreatingShell: false,
      autosaveTimers: {},
    });
  },
}));

