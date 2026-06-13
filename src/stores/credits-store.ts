import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_SIGNUP_TRIAL_CREDITS } from "@/lib/billing/constants";
import type { EarnRewardsSummary } from "@/lib/billing/reward-constants";
import { useAvailableModelsStore } from "@/stores/available-models-store";

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
  signupTrialCredits: number;
  trialGranted: boolean;
  hasOwnKey: boolean;
  preferCreditsFirst: boolean;
  billingTermsAccepted: boolean;
  trialIntroSeen: boolean;
  earnTokensIntroSeen: boolean;
  recentTransactions: CreditTransaction[];
  isLoading: boolean;
  isCheckoutLoading: boolean;
  isOpen: boolean;
  embeddedCheckoutOpen: boolean;
  embeddedClientSecret: string | null;
  embeddedCheckoutLoading: boolean;
  embeddedCheckoutError: string | null;
  ledgerRefreshNonce: number;
  realtimeInitialized: boolean;
  earnRewardsEligible: boolean;
  earnRewardsSummary: EarnRewardsSummary | null;
  earnRewardsLoading: boolean;
  setFromApi: (data: {
    creditsRemaining?: number;
    creditsBalance?: number;
    lifetimeConsumed?: number;
    lifetimePurchased?: number;
    trialCredits?: number;
    signupTrialCredits?: number;
    trialGranted?: boolean;
    hasOwnKey?: boolean;
    preferCreditsFirst?: boolean;
    billingTermsAccepted?: boolean;
    trialIntroSeen?: boolean;
    earnTokensIntroSeen?: boolean;
    recentTransactions?: CreditTransaction[];
  }) => void;
  setBalance: (balance: number) => void;
  setPreferCreditsFirst: (prefer: boolean) => Promise<void>;
  applyOptimisticConsume: (count?: number) => void;
  setIsLoading: (loading: boolean) => void;
  setIsCheckoutLoading: (loading: boolean) => void;
  setBillingTermsAccepted: (accepted: boolean) => void;
  setTrialIntroSeen: (seen: boolean) => void;
  setEarnTokensIntroSeen: (seen: boolean) => void;
  openPurchaseDialog: () => void;
  closePurchaseDialog: () => void;
  openEmbeddedCheckout: () => Promise<void>;
  closeEmbeddedCheckout: () => void;
  bumpLedgerRefresh: () => void;
  fetchCredits: () => Promise<void>;
  fetchEarnRewards: () => Promise<void>;
  initRealtime: (userId: string) => void;
  reset: () => void;
}

let realtimeChannel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
  null;

export const useCreditsStore = create<CreditsState>((set, get) => ({
  balance: null,
  lifetimeConsumed: 0,
  lifetimePurchased: 0,
  trialCredits: DEFAULT_SIGNUP_TRIAL_CREDITS,
  signupTrialCredits: DEFAULT_SIGNUP_TRIAL_CREDITS,
  trialGranted: false,
  hasOwnKey: false,
  preferCreditsFirst: true,
  billingTermsAccepted: false,
  trialIntroSeen: false,
  earnTokensIntroSeen: false,
  recentTransactions: [],
  isLoading: true,
  isCheckoutLoading: false,
  isOpen: false,
  embeddedCheckoutOpen: false,
  embeddedClientSecret: null,
  embeddedCheckoutLoading: false,
  embeddedCheckoutError: null,
  ledgerRefreshNonce: 0,
  realtimeInitialized: false,
  earnRewardsEligible: false,
  earnRewardsSummary: null,
  earnRewardsLoading: true,

  setFromApi: (data) =>
    set({
      balance: data.creditsRemaining ?? data.creditsBalance ?? get().balance,
      lifetimeConsumed: data.lifetimeConsumed ?? get().lifetimeConsumed,
      lifetimePurchased: data.lifetimePurchased ?? get().lifetimePurchased,
      trialCredits: data.trialCredits ?? get().trialCredits,
      signupTrialCredits: data.signupTrialCredits ?? get().signupTrialCredits,
      trialGranted: data.trialGranted ?? get().trialGranted,
      hasOwnKey: data.hasOwnKey ?? get().hasOwnKey,
      preferCreditsFirst: data.preferCreditsFirst ?? get().preferCreditsFirst,
      billingTermsAccepted:
        data.billingTermsAccepted ?? get().billingTermsAccepted,
      trialIntroSeen: data.trialIntroSeen ?? get().trialIntroSeen,
      earnTokensIntroSeen:
        data.earnTokensIntroSeen ?? get().earnTokensIntroSeen,
      recentTransactions: data.recentTransactions ?? get().recentTransactions,
      isLoading: false,
    }),

  setBalance: (balance) => set({ balance }),

  // Optimistically flip the preference, persist it, and refresh the model
  // catalog so the default model reflects the new credits-first state. Reverts
  // on failure.
  setPreferCreditsFirst: async (prefer) => {
    const previous = get().preferCreditsFirst;
    set({ preferCreditsFirst: prefer });
    useAvailableModelsStore.getState().invalidate();

    try {
      const res = await fetch("/api/billing/credit-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferCreditsFirst: prefer }),
      });
      if (!res.ok) throw new Error("Failed to update preference");
    } catch {
      set({ preferCreditsFirst: previous });
      useAvailableModelsStore.getState().invalidate();
    }
  },

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

  setEarnTokensIntroSeen: (earnTokensIntroSeen) => set({ earnTokensIntroSeen }),

  openPurchaseDialog: () => set({ isOpen: true }),

  closePurchaseDialog: () => set({ isOpen: false }),

  // Opens the in-app embedded Stripe checkout. Fetches the session client
  // secret here (rather than in a component effect) so the dialog can render
  // declaratively from store state. Credits land via the webhook + realtime.
  openEmbeddedCheckout: async () => {
    set({
      embeddedCheckoutOpen: true,
      embeddedCheckoutLoading: true,
      embeddedCheckoutError: null,
      embeddedClientSecret: null,
      isOpen: false,
    });

    try {
      const res = await fetch("/api/billing/checkout/embedded", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Unable to start checkout");
      }

      set({
        embeddedClientSecret: data.clientSecret,
        embeddedCheckoutLoading: false,
      });
    } catch (error) {
      set({
        embeddedCheckoutLoading: false,
        embeddedCheckoutError:
          error instanceof Error
            ? error.message
            : "Checkout failed. Please try again.",
      });
    }
  },

  closeEmbeddedCheckout: () =>
    set({
      embeddedCheckoutOpen: false,
      embeddedClientSecret: null,
      embeddedCheckoutLoading: false,
      embeddedCheckoutError: null,
    }),

  // Bumped after a successful purchase so views bound to it (e.g. the credit
  // ledger) refetch without a page navigation.
  bumpLedgerRefresh: () =>
    set({ ledgerRefreshNonce: get().ledgerRefreshNonce + 1 }),

  fetchEarnRewards: async () => {
    set({ earnRewardsLoading: true });
    try {
      const res = await fetch("/api/billing/earn-rewards");
      if (!res.ok) {
        set({ earnRewardsLoading: false });
        return;
      }
      const data = await res.json();
      set({
        earnRewardsEligible: data.eligible === true,
        earnRewardsSummary: data.summary ?? null,
        earnRewardsLoading: false,
      });
    } catch {
      set({ earnRewardsLoading: false });
    }
  },

  fetchCredits: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch("/api/billing/credits");
      if (!res.ok) {
        set({ isLoading: false });
        return;
      }
      const data = await res.json();
      get().setFromApi(data);
      void get().fetchEarnRewards();
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
            const previousBalance = get().balance;
            set({ balance: next.balance });

            // Webhook grants land after checkout completes — refresh billing
            // stats + ledger when balance goes up (purchase, refund, etc.).
            const balanceIncreased =
              previousBalance !== null && next.balance > previousBalance;
            if (balanceIncreased) {
              get().bumpLedgerRefresh();
              void get().fetchCredits();
              void get().fetchEarnRewards();
            }

            // When the balance crosses the zero boundary, credits-first state
            // changes, so refresh the model catalog to flip the default model
            // (cutover to the user's own key at 0, back to free on top-up).
            const crossedZero =
              (previousBalance === null || previousBalance > 0) &&
              next.balance === 0;
            const refilledFromZero =
              previousBalance === 0 && next.balance > 0;
            if (crossedZero || refilledFromZero) {
              useAvailableModelsStore.getState().invalidate();
            }
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
      trialCredits: DEFAULT_SIGNUP_TRIAL_CREDITS,
      signupTrialCredits: DEFAULT_SIGNUP_TRIAL_CREDITS,
      trialGranted: false,
      hasOwnKey: false,
      preferCreditsFirst: true,
      billingTermsAccepted: false,
      trialIntroSeen: false,
      earnTokensIntroSeen: false,
      recentTransactions: [],
      isLoading: true,
      isCheckoutLoading: false,
      isOpen: false,
      embeddedCheckoutOpen: false,
      embeddedClientSecret: null,
      embeddedCheckoutLoading: false,
      embeddedCheckoutError: null,
      ledgerRefreshNonce: 0,
      realtimeInitialized: false,
      earnRewardsEligible: false,
      earnRewardsSummary: null,
      earnRewardsLoading: true,
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
