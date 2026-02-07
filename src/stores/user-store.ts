import { create } from "zustand";
import type { Profile, EPBConfig, ManagedMember } from "@/types/database";

interface UserState {
  profile: Profile | null;
  subordinates: Profile[];
  managedMembers: ManagedMember[];
  epbConfig: EPBConfig | null;
  isLoading: boolean;
  termsAcceptedThisSession: boolean;
  setProfile: (profile: Profile | null) => void;
  setSubordinates: (subordinates: Profile[]) => void;
  setManagedMembers: (members: ManagedMember[]) => void;
  addManagedMember: (member: ManagedMember) => void;
  updateManagedMember: (id: string, updates: Partial<ManagedMember>) => void;
  removeManagedMember: (id: string) => void;
  setEpbConfig: (config: EPBConfig | null) => void;
  setIsLoading: (loading: boolean) => void;
  setTermsAcceptedThisSession: (accepted: boolean) => void;
  reset: () => void;
}

// Check sessionStorage for existing session acceptance on store creation
function getInitialSessionTerms(): boolean {
  try {
    return sessionStorage.getItem("epb_terms_accepted_session") === "true";
  } catch {
    return false;
  }
}

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  subordinates: [],
  managedMembers: [],
  epbConfig: null,
  isLoading: true,
  termsAcceptedThisSession: getInitialSessionTerms(),
  setProfile: (profile) => set({ profile }),
  setSubordinates: (subordinates) => set({ subordinates }),
  setManagedMembers: (managedMembers) => set({ managedMembers }),
  addManagedMember: (member) =>
    set((state) => ({
      managedMembers: [...state.managedMembers, member],
    })),
  updateManagedMember: (id, updates) =>
    set((state) => ({
      managedMembers: state.managedMembers.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
  removeManagedMember: (id) =>
    set((state) => ({
      managedMembers: state.managedMembers.filter((m) => m.id !== id),
    })),
  setEpbConfig: (epbConfig) => set({ epbConfig }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setTermsAcceptedThisSession: (accepted) => set({ termsAcceptedThisSession: accepted }),
  reset: () =>
    set({
      profile: null,
      subordinates: [],
      managedMembers: [],
      epbConfig: null,
      isLoading: true,
      termsAcceptedThisSession: false,
    }),
}));

