import { describe, expect, it } from "vitest";
import {
  canAcceptSupervisorFromManagedLink,
  isSelfSupervisorManagedLink,
  shouldCreateManagedLinkForExistingUser,
} from "@/lib/pending-managed-links";

const selfId = "82c3c1c9-d9ca-472d-89cf-df45c4ef3619";
const otherId = "0434c245-8b52-41ba-a638-013d5b364efb";

function link(supervisorId: string | null, accepted = false) {
  return {
    supervisor_accepted: accepted,
    team_member: {
      supervisor: supervisorId ? { id: supervisorId } : null,
    },
  };
}

describe("pending managed links", () => {
  it("detects when the viewer is the listed supervisor", () => {
    expect(isSelfSupervisorManagedLink(link(selfId), selfId)).toBe(true);
    expect(isSelfSupervisorManagedLink(link(otherId), selfId)).toBe(false);
    expect(isSelfSupervisorManagedLink(link(selfId), undefined)).toBe(false);
    expect(isSelfSupervisorManagedLink(link(null), selfId)).toBe(false);
  });

  it("blocks Accept Supervisor for self-links even when still pending", () => {
    expect(canAcceptSupervisorFromManagedLink(link(selfId), selfId)).toBe(false);
    expect(canAcceptSupervisorFromManagedLink(link(otherId), selfId)).toBe(true);
    expect(canAcceptSupervisorFromManagedLink(link(otherId, true), selfId)).toBe(
      false
    );
  });

  it("does not create a pending link when adding yourself", () => {
    expect(shouldCreateManagedLinkForExistingUser(selfId, selfId)).toBe(false);
    expect(shouldCreateManagedLinkForExistingUser(selfId, otherId)).toBe(true);
    expect(shouldCreateManagedLinkForExistingUser(selfId, null)).toBe(false);
  });
});
