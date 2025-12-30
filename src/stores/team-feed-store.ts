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
  // Comment counts
  comment_count?: number;
  unresolved_comment_count?: number;
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
  updateAccomplishmentCommentCounts: (
    counts: Record<string, { total: number; unresolved: number }>
  ) => void;
  updateAccomplishment: (id: string, updates: Partial<FeedAccomplishment>) => void;
  setIsLoading: (loading: boolean) => void;
  setHasSubordinates: (has: boolean) => void;
  reset: () => void;
}

export const useTeamFeedStore = create<TeamFeedState>((set) => ({
  feedAccomplishments: [],
  isLoading: true,
  hasSubordinates: false,
  setFeedAccomplishments: (feedAccomplishments) => set({ feedAccomplishments }),
  updateAccomplishmentCommentCounts: (counts) =>
    set((state) => ({
      feedAccomplishments: state.feedAccomplishments.map((acc) => ({
        ...acc,
        comment_count: counts[acc.id]?.total ?? acc.comment_count ?? 0,
        unresolved_comment_count:
          counts[acc.id]?.unresolved ?? acc.unresolved_comment_count ?? 0,
      })),
    })),
  updateAccomplishment: (id, updates) =>
    set((state) => ({
      feedAccomplishments: state.feedAccomplishments.map((acc) =>
        acc.id === id ? { ...acc, ...updates } : acc
      ),
    })),
  setIsLoading: (isLoading) => set({ isLoading }),
  setHasSubordinates: (hasSubordinates) => set({ hasSubordinates }),
  reset: () =>
    set({
      feedAccomplishments: [],
      isLoading: true,
      hasSubordinates: false,
    }),
}));


