import { create } from "zustand";
import type { Accomplishment, Profile, ManagedMember, Rank } from "@/types/database";

// Extended accomplishment with author info for feed display
export interface FeedAccomplishment extends Accomplishment {
  // Author info (either from profile or managed member)
  author_name: string;
  author_rank: Rank | null;
  author_afsc: string | null;
  author_unit: string | null;
  // Source tracking
  is_managed_member: boolean;
  managed_member_id: string | null;
  // Chain of command info
  chain_depth: number;
  supervisor_chain: ChainMember[];
}

export interface ChainMember {
  id: string;
  name: string;
  rank: Rank | null;
  depth: number;
  is_managed_member: boolean;
}

interface TeamFeedState {
  feedAccomplishments: FeedAccomplishment[];
  isLoading: boolean;
  hasSubordinates: boolean;
  setFeedAccomplishments: (accomplishments: FeedAccomplishment[]) => void;
  setIsLoading: (loading: boolean) => void;
  setHasSubordinates: (has: boolean) => void;
  reset: () => void;
}

export const useTeamFeedStore = create<TeamFeedState>((set) => ({
  feedAccomplishments: [],
  isLoading: true,
  hasSubordinates: false,
  setFeedAccomplishments: (feedAccomplishments) => set({ feedAccomplishments }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setHasSubordinates: (hasSubordinates) => set({ hasSubordinates }),
  reset: () =>
    set({
      feedAccomplishments: [],
      isLoading: true,
      hasSubordinates: false,
    }),
}));


