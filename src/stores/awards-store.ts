import { create } from "zustand";
import type { Award, AwardRequest, AwardCatalog } from "@/types/database";

interface AwardsState {
  // Awards for all visible team members
  awards: Award[];
  // Pending award requests (for supervisor)
  pendingRequests: AwardRequest[];
  // My submitted requests
  myRequests: AwardRequest[];
  // Award catalog
  awardCatalog: AwardCatalog[];
  // Loading states
  isLoading: boolean;
  isLoadingCatalog: boolean;
  
  // Actions
  setAwards: (awards: Award[]) => void;
  addAward: (award: Award) => void;
  updateAward: (id: string, updates: Partial<Award>) => void;
  removeAward: (id: string) => void;
  
  setPendingRequests: (requests: AwardRequest[]) => void;
  addPendingRequest: (request: AwardRequest) => void;
  removePendingRequest: (id: string) => void;
  
  setMyRequests: (requests: AwardRequest[]) => void;
  addMyRequest: (request: AwardRequest) => void;
  updateMyRequest: (id: string, updates: Partial<AwardRequest>) => void;
  removeMyRequest: (id: string) => void;
  
  setAwardCatalog: (catalog: AwardCatalog[]) => void;
  
  setIsLoading: (loading: boolean) => void;
  setIsLoadingCatalog: (loading: boolean) => void;
  
  // Helpers
  getAwardsForMember: (profileId?: string, teamMemberId?: string) => Award[];
  getAwardsByType: (type: Award["award_type"]) => Award[];
  reset: () => void;
}

export const useAwardsStore = create<AwardsState>((set, get) => ({
  awards: [],
  pendingRequests: [],
  myRequests: [],
  awardCatalog: [],
  isLoading: false,
  isLoadingCatalog: false,

  setAwards: (awards) => set({ awards }),
  addAward: (award) => set((state) => ({ awards: [award, ...state.awards] })),
  updateAward: (id, updates) =>
    set((state) => ({
      awards: state.awards.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),
  removeAward: (id) =>
    set((state) => ({
      awards: state.awards.filter((a) => a.id !== id),
    })),

  setPendingRequests: (requests) => set({ pendingRequests: requests }),
  addPendingRequest: (request) =>
    set((state) => ({
      pendingRequests: [request, ...state.pendingRequests],
    })),
  removePendingRequest: (id) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r.id !== id),
    })),

  setMyRequests: (requests) => set({ myRequests: requests }),
  addMyRequest: (request) =>
    set((state) => ({ myRequests: [request, ...state.myRequests] })),
  updateMyRequest: (id, updates) =>
    set((state) => ({
      myRequests: state.myRequests.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    })),
  removeMyRequest: (id) =>
    set((state) => ({
      myRequests: state.myRequests.filter((r) => r.id !== id),
    })),

  setAwardCatalog: (catalog) => set({ awardCatalog: catalog }),

  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsLoadingCatalog: (loading) => set({ isLoadingCatalog: loading }),

  getAwardsForMember: (profileId, teamMemberId) => {
    const { awards } = get();
    return awards.filter(
      (a) =>
        (profileId && a.recipient_profile_id === profileId) ||
        (teamMemberId && a.recipient_team_member_id === teamMemberId)
    );
  },

  getAwardsByType: (type) => {
    const { awards } = get();
    return awards.filter((a) => a.award_type === type);
  },

  reset: () =>
    set({
      awards: [],
      pendingRequests: [],
      myRequests: [],
      awardCatalog: [],
      isLoading: false,
      isLoadingCatalog: false,
    }),
}));

