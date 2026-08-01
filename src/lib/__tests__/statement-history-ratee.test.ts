import { describe, expect, it } from "vitest";
import { statementHistoryRateeFields } from "@/lib/statement-history-ratee";

describe("statementHistoryRateeFields", () => {
  it("uses rateeId as ratee_id for profile ratees", () => {
    expect(statementHistoryRateeFields("supervisor", "ratee-profile", false)).toEqual({
      ratee_id: "ratee-profile",
      team_member_id: null,
    });
  });

  it("maps managed members onto team_member_id with supervisor as ratee_id", () => {
    expect(statementHistoryRateeFields("supervisor", "member-uuid", true)).toEqual({
      ratee_id: "supervisor",
      team_member_id: "member-uuid",
    });
  });

  it("falls back to userId when rateeId is missing", () => {
    expect(statementHistoryRateeFields("supervisor", undefined, false)).toEqual({
      ratee_id: "supervisor",
      team_member_id: null,
    });
  });
});
