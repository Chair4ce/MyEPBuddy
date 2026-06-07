"use client";

import { useCreditsStore } from "@/stores/credits-store";
import { useAvailableModelsStore } from "@/stores/available-models-store";

export interface WillChargeToken {
  /** True when an AI action will consume a token (user is on the app's AI key). */
  willCharge: boolean;
  /** Remaining token balance, or null until loaded. */
  balance: number | null;
  /** Credits store still loading the initial balance. */
  isLoading: boolean;
}

/**
 * Whether a billable AI action will consume one of the user's tokens.
 *
 * Mirrors the server charging rule conservatively:
 * - No personal API key → always charged (free-tier users).
 * - Personal key + "use free tokens first" active → charged until balance hits 0.
 * - Personal key, not credits-first → uses their own key, no charge.
 *
 * Matches the optimistic-consume heuristic in the credits store (which keys off
 * hasOwnKey), so the indicator and the balance decrement stay in agreement.
 */
export function useWillChargeToken(): WillChargeToken {
  const hasOwnKey = useCreditsStore((s) => s.hasOwnKey);
  const balance = useCreditsStore((s) => s.balance);
  const isLoading = useCreditsStore((s) => s.isLoading);
  const creditsFirstActive = useAvailableModelsStore(
    (s) => s.cache?.creditsFirstActive ?? false,
  );

  return {
    willCharge: !hasOwnKey || creditsFirstActive,
    balance,
    isLoading,
  };
}
