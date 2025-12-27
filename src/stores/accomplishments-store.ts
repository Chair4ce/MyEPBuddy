import { create } from "zustand";
import type { Accomplishment } from "@/types/database";

interface AccomplishmentsState {
  accomplishments: Accomplishment[];
  selectedAccomplishments: string[];
  isLoading: boolean;
  setAccomplishments: (accomplishments: Accomplishment[]) => void;
  addAccomplishment: (accomplishment: Accomplishment) => void;
  updateAccomplishment: (id: string, data: Partial<Accomplishment>) => void;
  removeAccomplishment: (id: string) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setIsLoading: (loading: boolean) => void;
}

export const useAccomplishmentsStore = create<AccomplishmentsState>(
  (set, get) => ({
    accomplishments: [],
    selectedAccomplishments: [],
    isLoading: true,
    setAccomplishments: (accomplishments) => set({ accomplishments }),
    addAccomplishment: (accomplishment) =>
      set((state) => ({
        accomplishments: [accomplishment, ...state.accomplishments],
      })),
    updateAccomplishment: (id, data) =>
      set((state) => ({
        accomplishments: state.accomplishments.map((a) =>
          a.id === id ? { ...a, ...data } : a
        ),
      })),
    removeAccomplishment: (id) =>
      set((state) => ({
        accomplishments: state.accomplishments.filter((a) => a.id !== id),
        selectedAccomplishments: state.selectedAccomplishments.filter(
          (sid) => sid !== id
        ),
      })),
    toggleSelection: (id) =>
      set((state) => ({
        selectedAccomplishments: state.selectedAccomplishments.includes(id)
          ? state.selectedAccomplishments.filter((sid) => sid !== id)
          : [...state.selectedAccomplishments, id],
      })),
    selectAll: () =>
      set((state) => ({
        selectedAccomplishments: state.accomplishments.map((a) => a.id),
      })),
    clearSelection: () => set({ selectedAccomplishments: [] }),
    setIsLoading: (isLoading) => set({ isLoading }),
  })
);



