import { describe, expect, it } from "vitest";
import {
  coveredSupervisorIdsFromPendingLinks,
  filterSuperviseRequestsCoveredByManagedLinks,
} from "@/lib/team-request-dedupe";
import type { TeamRequest } from "@/types/database";

function req(
  partial: Partial<TeamRequest> & Pick<TeamRequest, "id" | "requester_id" | "request_type">
): TeamRequest {
  return {
    target_id: "target",
    status: "pending",
    message: null,
    created_at: new Date().toISOString(),
    responded_at: null,
    ...partial,
  };
}

describe("filterSuperviseRequestsCoveredByManagedLinks", () => {
  it("hides supervise requests covered by an open managed link", () => {
    const covered = new Set(["sup-1"]);
    const result = filterSuperviseRequestsCoveredByManagedLinks(
      [
        req({ id: "a", requester_id: "sup-1", request_type: "supervise" }),
        req({ id: "b", requester_id: "sup-2", request_type: "supervise" }),
        req({ id: "c", requester_id: "sup-1", request_type: "be_supervised" }),
      ],
      covered
    );
    expect(result.map((r) => r.id)).toEqual(["b", "c"]);
  });
});

describe("coveredSupervisorIdsFromPendingLinks", () => {
  it("reads nested and array team_members shapes", () => {
    const ids = coveredSupervisorIdsFromPendingLinks([
      { team_members: { supervisor_id: "a" } },
      { team_members: [{ supervisor_id: "b" }] },
      { team_members: null },
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});
