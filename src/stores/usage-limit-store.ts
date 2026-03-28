import { create } from "zustand";

interface UsageLimitState {
  isOpen: boolean;
  weeklyUsed: number;
  weeklyLimit: number;
  resetDate: string | null;
  openDialog: (stats: { weeklyUsed: number; weeklyLimit: number; resetDate?: string }) => void;
  closeDialog: () => void;
}

export const useUsageLimitStore = create<UsageLimitState>((set) => ({
  isOpen: false,
  weeklyUsed: 0,
  weeklyLimit: 20,
  resetDate: null,
  openDialog: ({ weeklyUsed, weeklyLimit, resetDate }) =>
    set({ isOpen: true, weeklyUsed, weeklyLimit, resetDate: resetDate ?? null }),
  closeDialog: () => set({ isOpen: false }),
}));

/**
 * Call after every LLM API response. If the response indicates the usage
 * limit has been exceeded, opens the blocking dialog and returns true.
 * Otherwise returns false so the caller can continue normal error handling.
 */
export function handleUsageLimitResponse(errorData: {
  errorCode?: string;
  error?: string;
}): boolean {
  if (errorData?.errorCode !== "usage_limit_exceeded") return false;

  const weeklyMatch = errorData.error?.match(/\((\d+)\/(\d+)\)/);
  const weeklyUsed = weeklyMatch ? parseInt(weeklyMatch[1], 10) : 20;
  const weeklyLimit = weeklyMatch ? parseInt(weeklyMatch[2], 10) : 20;

  useUsageLimitStore.getState().openDialog({ weeklyUsed, weeklyLimit });
  return true;
}
