import { create } from "zustand";
import type { 
  DecorationShell, 
  DecorationAwardType, 
  DecorationReason, 
  DecorationStatus,
  Rank,
  Accomplishment,
} from "@/types/database";

// Ratee info for the selected member
export interface SelectedRatee {
  id: string;
  fullName: string | null;
  rank: Rank | null;
  afsc: string | null;
  unit: string | null;
  isManagedMember: boolean;
  gender?: "male" | "female";
}

// Snapshot type for citation history
export interface DecorationSnapshot {
  id: string;
  shell_id: string;
  citation_text: string;
  created_by: string | null;
  note: string | null;
  created_at: string;
}

// Available highlight colors for statement tracking
export const HIGHLIGHT_COLORS = [
  { id: "yellow", label: "Yellow", bg: "bg-yellow-200", text: "text-yellow-900", border: "border-yellow-400" },
  { id: "green", label: "Green", bg: "bg-green-200", text: "text-green-900", border: "border-green-400" },
  { id: "blue", label: "Blue", bg: "bg-blue-200", text: "text-blue-900", border: "border-blue-400" },
  { id: "pink", label: "Pink", bg: "bg-pink-200", text: "text-pink-900", border: "border-pink-400" },
  { id: "purple", label: "Purple", bg: "bg-purple-200", text: "text-purple-900", border: "border-purple-400" },
  { id: "orange", label: "Orange", bg: "bg-orange-200", text: "text-orange-900", border: "border-orange-400" },
  { id: "cyan", label: "Cyan", bg: "bg-cyan-200", text: "text-cyan-900", border: "border-cyan-400" },
  { id: "lime", label: "Lime", bg: "bg-lime-200", text: "text-lime-900", border: "border-lime-400" },
] as const;

export type HighlightColorId = typeof HIGHLIGHT_COLORS[number]["id"];

// Map of statement ID to highlight color ID
export type StatementColorMap = Record<string, HighlightColorId>;

// Citation text highlight range
export interface CitationHighlight {
  id: string;
  startIndex: number;
  endIndex: number;
  colorId: HighlightColorId;
  statementId?: string; // Optional link to source statement
}

interface DecorationShellState {
  // Current selected ratee (self or subordinate/managed member)
  selectedRatee: SelectedRatee | null;
  
  // The loaded decoration shell
  currentShell: DecorationShell | null;
  
  // Award configuration
  awardType: DecorationAwardType;
  reason: DecorationReason;
  
  // Ratee position info
  dutyTitle: string;
  unit: string;
  startDate: string;
  endDate: string;
  
  // Citation content
  citationText: string;
  
  // Selected statement/accomplishment IDs
  selectedStatementIds: string[];
  
  // Status
  status: DecorationStatus;
  
  // Snapshots for citation history
  snapshots: DecorationSnapshot[];
  
  // Revision settings
  revisionAggressiveness: number; // 0-100
  isRevising: boolean;
  
  // Loading states
  isLoadingShell: boolean;
  isCreatingShell: boolean;
  isGenerating: boolean;
  isSaving: boolean;
  
  // AI model selection
  selectedModel: string;
  
  // UI state
  isDirty: boolean;
  showHistory: boolean;
  
  // Statement color highlighting
  statementColors: StatementColorMap;
  activeHighlightColor: HighlightColorId | null; // Currently hovered/focused color for matching
  
  // Citation text highlights
  citationHighlights: CitationHighlight[];
  
  // Actions
  setSelectedRatee: (ratee: SelectedRatee | null) => void;
  setCurrentShell: (shell: DecorationShell | null) => void;
  
  // Award configuration
  setAwardType: (type: DecorationAwardType) => void;
  setReason: (reason: DecorationReason) => void;
  
  // Position info
  setDutyTitle: (title: string) => void;
  setUnit: (unit: string) => void;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  
  // Citation
  setCitationText: (text: string) => void;
  
  // Statement selection
  setSelectedStatementIds: (ids: string[]) => void;
  toggleStatementSelection: (id: string) => void;
  clearSelectedStatements: () => void;
  
  // Status
  setStatus: (status: DecorationStatus) => void;
  
  // Snapshots
  setSnapshots: (snapshots: DecorationSnapshot[]) => void;
  addSnapshot: (snapshot: DecorationSnapshot) => void;
  removeSnapshot: (id: string) => void;
  setShowHistory: (show: boolean) => void;
  
  // Revision settings
  setRevisionAggressiveness: (value: number) => void;
  setIsRevising: (revising: boolean) => void;
  
  // Loading states
  setIsLoadingShell: (loading: boolean) => void;
  setIsCreatingShell: (creating: boolean) => void;
  setIsGenerating: (generating: boolean) => void;
  setIsSaving: (saving: boolean) => void;
  
  // AI model
  setSelectedModel: (model: string) => void;
  
  // UI state
  setIsDirty: (dirty: boolean) => void;
  
  // Statement color highlighting
  setStatementColor: (statementId: string, color: HighlightColorId | null) => void;
  clearStatementColors: () => void;
  setActiveHighlightColor: (color: HighlightColorId | null) => void;
  getStatementColor: (statementId: string) => HighlightColorId | null;
  
  // Citation text highlights
  addCitationHighlight: (highlight: Omit<CitationHighlight, "id">) => void;
  removeCitationHighlight: (id: string) => void;
  clearCitationHighlights: () => void;
  
  // Get accomplishment texts for generation
  getSelectedAccomplishmentTexts: (accomplishments: Accomplishment[]) => string[];
  
  // Initialize from shell
  initializeFromShell: (shell: DecorationShell) => void;
  
  // Reset
  reset: () => void;
}

const getDefaultState = () => ({
  selectedRatee: null,
  currentShell: null,
  awardType: "afam" as DecorationAwardType,
  reason: "meritorious_service" as DecorationReason,
  dutyTitle: "",
  unit: "",
  startDate: "",
  endDate: "",
  citationText: "",
  selectedStatementIds: [],
  status: "draft" as DecorationStatus,
  snapshots: [] as DecorationSnapshot[],
  revisionAggressiveness: 50,
  isRevising: false,
  isLoadingShell: false,
  isCreatingShell: false,
  isGenerating: false,
  isSaving: false,
  selectedModel: "gemini-2.0-flash",
  isDirty: false,
  showHistory: false,
  statementColors: {} as StatementColorMap,
  activeHighlightColor: null,
  citationHighlights: [] as CitationHighlight[],
});

export const useDecorationShellStore = create<DecorationShellState>((set, get) => ({
  ...getDefaultState(),
  
  setSelectedRatee: (ratee) => set({ selectedRatee: ratee }),
  
  setCurrentShell: (shell) => {
    if (shell) {
      set({
        currentShell: shell,
        awardType: shell.award_type,
        reason: shell.reason,
        dutyTitle: shell.duty_title,
        unit: shell.unit,
        startDate: shell.start_date || "",
        endDate: shell.end_date || "",
        citationText: shell.citation_text,
        selectedStatementIds: shell.selected_statement_ids || [],
        status: shell.status,
        isDirty: false,
      });
    } else {
      set({ currentShell: null });
    }
  },
  
  setAwardType: (type) => set({ awardType: type, isDirty: true }),
  setReason: (reason) => set({ reason, isDirty: true }),
  
  setDutyTitle: (title) => set({ dutyTitle: title, isDirty: true }),
  setUnit: (unit) => set({ unit, isDirty: true }),
  setStartDate: (date) => set({ startDate: date, isDirty: true }),
  setEndDate: (date) => set({ endDate: date, isDirty: true }),
  
  setCitationText: (text) => set({ citationText: text, isDirty: true }),
  
  setSelectedStatementIds: (ids) => set({ selectedStatementIds: ids, isDirty: true }),
  
  toggleStatementSelection: (id) => {
    const { selectedStatementIds } = get();
    if (selectedStatementIds.includes(id)) {
      set({ 
        selectedStatementIds: selectedStatementIds.filter(sid => sid !== id),
        isDirty: true,
      });
    } else {
      set({ 
        selectedStatementIds: [...selectedStatementIds, id],
        isDirty: true,
      });
    }
  },
  
  clearSelectedStatements: () => set({ selectedStatementIds: [], isDirty: true }),
  
  setStatus: (status) => set({ status, isDirty: true }),
  
  setIsLoadingShell: (loading) => set({ isLoadingShell: loading }),
  setIsCreatingShell: (creating) => set({ isCreatingShell: creating }),
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  setIsSaving: (saving) => set({ isSaving: saving }),
  
  setSelectedModel: (model) => set({ selectedModel: model }),
  
  setIsDirty: (dirty) => set({ isDirty: dirty }),
  
  // Snapshots
  setSnapshots: (snapshots) => set({ snapshots }),
  addSnapshot: (snapshot) => set((state) => ({ 
    snapshots: [snapshot, ...state.snapshots] 
  })),
  removeSnapshot: (id) => set((state) => ({
    snapshots: state.snapshots.filter((s) => s.id !== id)
  })),
  setShowHistory: (show) => set({ showHistory: show }),
  
  // Revision settings
  setRevisionAggressiveness: (value) => set({ revisionAggressiveness: value }),
  setIsRevising: (revising) => set({ isRevising: revising }),
  
  // Statement color highlighting
  setStatementColor: (statementId, color) => set((state) => {
    if (color === null) {
      // Remove color assignment
      const { [statementId]: _, ...rest } = state.statementColors;
      return { statementColors: rest };
    }
    return { 
      statementColors: { ...state.statementColors, [statementId]: color } 
    };
  }),
  clearStatementColors: () => set({ statementColors: {} }),
  setActiveHighlightColor: (color) => set({ activeHighlightColor: color }),
  getStatementColor: (statementId) => {
    const { statementColors } = get();
    return statementColors[statementId] || null;
  },
  
  // Citation text highlights
  addCitationHighlight: (highlight) => set((state) => ({
    citationHighlights: [
      ...state.citationHighlights,
      { ...highlight, id: `hl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` }
    ]
  })),
  removeCitationHighlight: (id) => set((state) => ({
    citationHighlights: state.citationHighlights.filter(h => h.id !== id)
  })),
  clearCitationHighlights: () => set({ citationHighlights: [] }),
  
  getSelectedAccomplishmentTexts: (accomplishments) => {
    const { selectedStatementIds } = get();
    return accomplishments
      .filter(a => selectedStatementIds.includes(a.id))
      .map(a => {
        // Combine action verb, details, impact, and metrics into a coherent accomplishment text
        let text = `${a.action_verb} ${a.details}`;
        if (a.impact) {
          text += ` ${a.impact}`;
        }
        if (a.metrics) {
          text += ` ${a.metrics}`;
        }
        return text;
      });
  },
  
  initializeFromShell: (shell) => {
    set({
      currentShell: shell,
      awardType: shell.award_type,
      reason: shell.reason,
      dutyTitle: shell.duty_title,
      unit: shell.unit,
      startDate: shell.start_date || "",
      endDate: shell.end_date || "",
      citationText: shell.citation_text,
      selectedStatementIds: shell.selected_statement_ids || [],
      status: shell.status,
      isDirty: false,
    });
  },
  
  reset: () => set(getDefaultState()),
}));
