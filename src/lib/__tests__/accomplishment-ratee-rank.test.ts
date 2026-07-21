import { describe, expect, it } from "vitest";
import { resolveAccomplishmentRateeRank } from "../accomplishment-ratee-rank";

describe("resolveAccomplishmentRateeRank", () => {
  it("uses managed member rank when team_member_id is set", () => {
    expect(
      resolveAccomplishmentRateeRank({
        teamMemberId: "tm-1",
        managedMemberRank: "SSgt",
        ownerProfileRank: "MSgt",
      })
    ).toBe("SSgt");
  });

  it("returns null managed rank rather than falling back to supervisor", () => {
    expect(
      resolveAccomplishmentRateeRank({
        teamMemberId: "tm-1",
        managedMemberRank: null,
        ownerProfileRank: "MSgt",
      })
    ).toBeNull();
  });

  it("uses owner profile rank for self / registered subordinate entries", () => {
    expect(
      resolveAccomplishmentRateeRank({
        teamMemberId: null,
        managedMemberRank: "SSgt",
        ownerProfileRank: "TSgt",
      })
    ).toBe("TSgt");
  });
});
