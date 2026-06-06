import { create } from "zustand";

interface UsageLimitState {
  isOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

/** @deprecated Use credits-store for purchase dialog */
export const useUsageLimitStore = create<UsageLimitState>((set) => ({
  isOpen: false,
  openDialog: () => set({ isOpen: true }),
  closeDialog: () => set({ isOpen: false }),
}));

export {
  handleCreditsErrorResponse as handleUsageLimitResponse,
  syncCreditsFromResponse,
} from "@/stores/credits-store";
