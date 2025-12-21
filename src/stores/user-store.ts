import { create } from "zustand";
import type { Profile, EPBConfig, ManagedMember } from "@/types/database";

interface UserState {
  profile: Profile | null;
  subordinates: Profile[];
  managedMembers: ManagedMember[];
  epbConfig: EPBConfig | null;
  isLoading: boolean;
  setProfile: (profile: Profile | null) => void;
  setSubordinates: (subordinates: Profile[]) => void;
  setManagedMembers: (members: ManagedMember[]) => void;
  addManagedMember: (member: ManagedMember) => void;
  updateManagedMember: (id: string, updates: Partial<ManagedMember>) => void;
  removeManagedMember: (id: string) => void;
  setEpbConfig: (config: EPBConfig | null) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  subordinates: [],
  managedMembers: [],
  epbConfig: null,
  isLoading: true,
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
  reset: () =>
    set({
      profile: null,
      subordinates: [],
      managedMembers: [],
      epbConfig: null,
      isLoading: true,
    }),
}));

