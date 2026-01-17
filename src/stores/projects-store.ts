import { create } from "zustand";
import type { Project, ProjectMember } from "@/types/database";

interface ProjectsState {
  // Data
  projects: Project[];
  selectedProjectId: string | null;
  
  // UI State
  isLoading: boolean;
  isPanelOpen: boolean;
  isAssignMode: boolean;
  
  // Setters
  setProjects: (projects: Project[]) => void;
  setSelectedProjectId: (id: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setAssignMode: (assignMode: boolean) => void;
  toggleAssignMode: () => void;
  
  // CRUD helpers
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  
  // Member helpers
  addProjectMember: (projectId: string, member: ProjectMember) => void;
  removeProjectMember: (projectId: string, memberId: string) => void;
  updateProjectMember: (projectId: string, memberId: string, updates: Partial<ProjectMember>) => void;
  
  // Selectors (derived state helpers)
  getProjectById: (id: string) => Project | undefined;
  getProjectsForCycle: (cycleYear: number) => Project[];
  getUserOwnedProjects: (userId: string) => Project[];
  
  // Reset
  reset: () => void;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  // Initial state
  projects: [],
  selectedProjectId: null,
  isLoading: false,
  isPanelOpen: false,
  isAssignMode: false,
  
  // Setters
  setProjects: (projects) => set({ projects }),
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setPanelOpen: (isPanelOpen) => set({ isPanelOpen }),
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  setAssignMode: (isAssignMode) => set({ isAssignMode }),
  toggleAssignMode: () => set((state) => ({ isAssignMode: !state.isAssignMode })),
  
  // CRUD helpers
  addProject: (project) =>
    set((state) => ({
      projects: [project, ...state.projects],
    })),
    
  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
      ),
    })),
    
  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
    })),
    
  // Member helpers
  addProjectMember: (projectId, member) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, members: [...(p.members || []), member] }
          : p
      ),
    })),
    
  removeProjectMember: (projectId, memberId) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, members: (p.members || []).filter((m) => m.id !== memberId) }
          : p
      ),
    })),
    
  updateProjectMember: (projectId, memberId, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              members: (p.members || []).map((m) =>
                m.id === memberId ? { ...m, ...updates } : m
              ),
            }
          : p
      ),
    })),
    
  // Selectors
  getProjectById: (id) => get().projects.find((p) => p.id === id),
  
  getProjectsForCycle: (cycleYear) =>
    get().projects.filter((p) => p.cycle_year === cycleYear),
    
  getUserOwnedProjects: (userId) =>
    get().projects.filter((p) =>
      p.members?.some((m) => m.profile_id === userId && m.is_owner)
    ),
    
  // Reset
  reset: () =>
    set({
      projects: [],
      selectedProjectId: null,
      isLoading: false,
      isPanelOpen: false,
      isAssignMode: false,
    }),
}));
