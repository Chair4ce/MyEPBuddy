import { describe, expect, it } from "vitest";
import { resolveOnboardingStep } from "@/lib/onboarding-flow";
import type { Profile } from "@/types/database";

function profile(overrides: Partial<Profile>): Profile {
  return {
    id: "user-1",
    email: "user@test.af.mil",
    full_name: "Test User",
    first_name: "Test",
    last_name: "User",
    rank: "SSgt",
    afsc: null,
    unit: null,
    role: "member",
    supervisor_id: null,
    avatar_url: null,
    writing_style: "personal",
    terms_accepted_at: "2026-09-16T00:00:00.000Z",
    billing_terms_accepted_at: null,
    marketing_email_opt_in: null,
    marketing_email_opt_in_at: null,
    marketing_email_opt_in_source: null,
    trial_intro_seen_at: null,
    earn_tokens_intro_seen_at: null,
    coaching_features_intro_seen_at: null,
    purchase_campaign_promo_seen_slug: null,
    created_at: "2026-09-16T00:00:00.000Z",
    updated_at: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

const baseArgs = {
  creditsLoading: false,
  hasOwnKey: false,
  trialIntroSeen: false,
  earnTokensIntroSeen: false,
  rankDismissed: false,
};

describe("resolveOnboardingStep", () => {
  it("always blocks on unfinished terms", () => {
    expect(
      resolveOnboardingStep({
        ...baseArgs,
        profile: profile({ terms_accepted_at: null, rank: null }),
        deferOptionalIntros: true,
      }),
    ).toBe("terms");
  });

  it("still prompts for rank after terms, but never auto-opens trial or earn-tokens", () => {
    expect(
      resolveOnboardingStep({
        ...baseArgs,
        profile: profile({ rank: null, terms_accepted_at: "2026-09-16T00:00:00.000Z" }),
        deferOptionalIntros: false,
      }),
    ).toBe("rank");
    expect(
      resolveOnboardingStep({
        ...baseArgs,
        profile: profile({ rank: "SSgt" }),
        deferOptionalIntros: false,
      }),
    ).toBeNull();
  });
});
