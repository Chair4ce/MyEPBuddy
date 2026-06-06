import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { TRIAL_CREDITS } from "@/lib/billing/constants";

export interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  action_type: string | null;
  description: string | null;
  created_at: string;
}

interface CreditsState {
  balance: number | null;
  lifetimeConsumed: number;
  lifetimePurchased: number;
  trialCredits: number;
  trialGranted: boolean;
  hasOwnKey: boolean;
  billingTermsAccepted: boolean;
  trialIntroSeen: boolean;
  recentTransactions: CreditTransaction[];
  isLoading: boolean;
  isCheckoutLoading: boolean;
  isOpen: boolean;
  realtimeInitialized: boolean;
  setFromApi: (data: {
    creditsRemaining?: number;
    creditsBalance?: number;
    lifetimeConsumed?: number;
    lifetimePurchased?: number;
    trialCredits?: number;
    trialGranted?: boolean;
    hasOwnKey?: boolean;
    billingTermsAccepted?: boolean;
    trialIntroSeen?: boolean;
    recentTransactions?: CreditTransaction[];
  }) => void;
  setBalance: (balance: number) => void;
  applyOptimisticConsume: (count?: number) => void;
  setIsLoading: (loading: boolean) => void;
  setIsCheckoutLoading: (loading: boolean) => void;
  setBillingTermsAccepted: (accepted: boolean) => void;
  setTrialIntroSeen: (seen: boolean) => void;
  openPurchaseDialog: () => void;
  closePurchaseDialog: () => void;
  fetchCredits: () => Promise<void>;
  initRealtime: (userId: string) => void;
  reset: () => void;
}

let realtimeChannel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
  null;

export const useCreditsStore = create<CreditsState>((set, get) => ({
  balance: null,
  lifetimeConsumed: 0,
  lifetimePurchased: 0,
  trialCredits: TRIAL_CREDITS,
  trialGranted: false,
  hasOwnKey: false,
  billingTermsAccepted: false,
  trialIntroSeen: false,
  recentTransactions: [],
  isLoading: true,
  isCheckoutLoading: false,
  isOpen: false,
  realtimeInitialized: false,

  setFromApi: (data) =>
    set({
      balance: data.creditsRemaining ?? data.creditsBalance ?? get().balance,
      lifetimeConsumed: data.lifetimeConsumed ?? get().lifetimeConsumed,
      lifetimePurchased: data.lifetimePurchased ?? get().lifetimePurchased,
      trialCredits: data.trialCredits ?? TRIAL_CREDITS,
      trialGranted: data.trialGranted ?? get().trialGranted,
      hasOwnKey: data.hasOwnKey ?? get().hasOwnKey,
      billingTermsAccepted:
        data.billingTermsAccepted ?? get().billingTermsAccepted,
      trialIntroSeen: data.trialIntroSeen ?? get().trialIntroSeen,
      recentTransactions: data.recentTransactions ?? get().recentTransactions,
      isLoading: false,
    }),

  setBalance: (balance) => set({ balance }),

  // Instant client-side decrement for snappy UX. The authoritative balance is
  // reconciled by Realtime (consume_credit UPDATE) or a response header, so any
  // drift self-corrects. No-op for BYOK users (they don't consume credits).
  applyOptimisticConsume: (count = 1) => {
    const { balance, hasOwnKey, lifetimeConsumed } = get();
    if (hasOwnKey || balance === null) return;
    set({
      balance: Math.max(0, balance - count),
      lifetimeConsumed: lifetimeConsumed + count,
    });
  },

  setIsLoading: (isLoading) => set({ isLoading }),

  setIsCheckoutLoading: (isCheckoutLoading) => set({ isCheckoutLoading }),

  setBillingTermsAccepted: (billingTermsAccepted) =>
    set({ billingTermsAccepted }),

  setTrialIntroSeen: (trialIntroSeen) => set({ trialIntroSeen }),

  openPurchaseDialog: () => set({ isOpen: true }),

  closePurchaseDialog: () => set({ isOpen: false }),

  fetchCredits: async () => {
    try {
      const res = await fetch("/api/billing/credits");
      if (!res.ok) return;
      const data = await res.json();
      get().setFromApi(data);
    } catch {
      set({ isLoading: false });
    }
  },

  initRealtime: (userId: string) => {
    if (get().realtimeInitialized || !userId) return;

    const supabase = createClient();
    realtimeChannel = supabase
      .channel(`user_credits:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_credits",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as { balance?: number };
          if (typeof next.balance === "number") {
            set({ balance: next.balance });
          }
        },
      )
      .subscribe();

    set({ realtimeInitialized: true });
  },

  reset: () => {
    if (realtimeChannel) {
      const supabase = createClient();
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    set({
      balance: null,
      lifetimeConsumed: 0,
      lifetimePurchased: 0,
      trialCredits: TRIAL_CREDITS,
      trialGranted: false,
      hasOwnKey: false,
      billingTermsAccepted: false,
      trialIntroSeen: false,
      recentTransactions: [],
      isLoading: true,
      isCheckoutLoading: false,
      isOpen: false,
      realtimeInitialized: false,
    });
  },
}));

export function syncCreditsFromResponse(response: Response): void {
  const remaining = response.headers.get("X-Credits-Remaining");
  if (remaining !== null) {
    const parsed = parseInt(remaining, 10);
    if (!Number.isNaN(parsed)) {
      useCreditsStore.getState().setBalance(parsed);
    }
  }
}

export function handleCreditsErrorResponse(errorData: {
  errorCode?: string;
}): boolean {
  if (errorData?.errorCode !== "insufficient_credits") return false;
  useCreditsStore.getState().openPurchaseDialog();
  return true;
}
