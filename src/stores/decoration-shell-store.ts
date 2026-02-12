import { create } from "zustand";
import type { 
  DecorationShell, 
  DecorationAwardType, 
  DecorationReason, 
  DecorationStatus,
  Rank,
  RefinedStatement,
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
// Glass-style backgrounds for statements (subtle), solid for citation highlights (readable)
export const HIGHLIGHT_COLORS = [
  { id: "red", label: "Red", bgGlass: "bg-red-500/15", bgSolid: "bg-red-500", text: "text-red-700 dark:text-red-400", textSolid: "text-white", border: "border-red-500", borderLeft: "border-l-red-500", hex: "#ef4444" },
  { id: "orange", label: "Orange", bgGlass: "bg-orange-500/15", bgSolid: "bg-orange-500", text: "text-orange-700 dark:text-orange-400", textSolid: "text-white", border: "border-orange-500", borderLeft: "border-l-orange-500", hex: "#f97316" },
  { id: "amber", label: "Amber", bgGlass: "bg-amber-500/15", bgSolid: "bg-amber-500", text: "text-amber-700 dark:text-amber-500", textSolid: "text-black", border: "border-amber-500", borderLeft: "border-l-amber-500", hex: "#f59e0b" },
  { id: "green", label: "Green", bgGlass: "bg-green-500/15", bgSolid: "bg-green-600", text: "text-green-700 dark:text-green-400", textSolid: "text-white", border: "border-green-500", borderLeft: "border-l-green-500", hex: "#16a34a" },
  { id: "teal", label: "Teal", bgGlass: "bg-teal-500/15", bgSolid: "bg-teal-500", text: "text-teal-700 dark:text-teal-400", textSolid: "text-white", border: "border-teal-500", borderLeft: "border-l-teal-500", hex: "#14b8a6" },
  { id: "blue", label: "Blue", bgGlass: "bg-blue-500/15", bgSolid: "bg-blue-500", text: "text-blue-700 dark:text-blue-400", textSolid: "text-white", border: "border-blue-500", borderLeft: "border-l-blue-500", hex: "#3b82f6" },
  { id: "indigo", label: "Indigo", bgGlass: "bg-indigo-500/15", bgSolid: "bg-indigo-500", text: "text-indigo-700 dark:text-indigo-400", textSolid: "text-white", border: "border-indigo-500", borderLeft: "border-l-indigo-500", hex: "#6366f1" },
  { id: "purple", label: "Purple", bgGlass: "bg-purple-500/15", bgSolid: "bg-purple-500", text: "text-purple-700 dark:text-purple-400", textSolid: "text-white", border: "border-purple-500", borderLeft: "border-l-purple-500", hex: "#a855f7" },
  { id: "pink", label: "Pink", bgGlass: "bg-pink-500/15", bgSolid: "bg-pink-500", text: "text-pink-700 dark:text-pink-400", textSolid: "text-white", border: "border-pink-500", borderLeft: "border-l-pink-500", hex: "#ec4899" },
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
  matchedText?: string; // The actual text that was matched (for re-finding after edits)
  keyNumbers?: string[]; // Key numbers from the source statement for matching
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
  office: string;
  squadron: string;
  groupName: string;
  wing: string;
  baseName: string;
  location: string;
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
  setOffice: (office: string) => void;
  setSquadron: (squadron: string) => void;
  setGroupName: (groupName: string) => void;
  setWing: (wing: string) => void;
  setBaseName: (baseName: string) => void;
  setLocation: (location: string) => void;
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
  
  // Get selected statement texts for generation
  getSelectedStatementTexts: (statements: RefinedStatement[]) => string[];
  
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
  office: "",
  squadron: "",
  groupName: "",
  wing: "",
  baseName: "",
  location: "",
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
        office: shell.office || shell.unit || "",
        squadron: shell.squadron || "",
        groupName: shell.group_name || "",
        wing: shell.wing || "",
        baseName: shell.base_name || "",
        location: shell.location || "",
        startDate: shell.start_date || "",
        endDate: shell.end_date || "",
        citationText: shell.citation_text,
        selectedStatementIds: shell.selected_statement_ids || [],
        statementColors: (shell.statement_colors || {}) as StatementColorMap,
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
  setOffice: (office) => set({ office, isDirty: true }),
  setSquadron: (squadron) => set({ squadron, isDirty: true }),
  setGroupName: (groupName) => set({ groupName, isDirty: true }),
  setWing: (wing) => set({ wing, isDirty: true }),
  setBaseName: (baseName) => set({ baseName, isDirty: true }),
  setLocation: (location) => set({ location, isDirty: true }),
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
      return { statementColors: rest, isDirty: true };
    }
    return { 
      statementColors: { ...state.statementColors, [statementId]: color },
      isDirty: true,
    };
  }),
  clearStatementColors: () => set({ statementColors: {}, isDirty: true }),
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
  
  getSelectedStatementTexts: (statements) => {
    const { selectedStatementIds } = get();
    return statements
      .filter(s => selectedStatementIds.includes(s.id))
      .map(s => s.statement); // RefinedStatement has a single 'statement' field
  },
  
  initializeFromShell: (shell) => {
    set({
      currentShell: shell,
      awardType: shell.award_type,
      reason: shell.reason,
      dutyTitle: shell.duty_title,
      office: shell.office || shell.unit || "",
      squadron: shell.squadron || "",
      groupName: shell.group_name || "",
      wing: shell.wing || "",
      baseName: shell.base_name || "",
      location: shell.location || "",
      startDate: shell.start_date || "",
      endDate: shell.end_date || "",
      citationText: shell.citation_text,
      selectedStatementIds: shell.selected_statement_ids || [],
      statementColors: (shell.statement_colors || {}) as StatementColorMap,
      status: shell.status,
      isDirty: false,
    });
  },
  
  reset: () => set(getDefaultState()),
}));
