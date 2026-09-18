import { describe, expect, it } from "vitest";
import {
  canRequestTeamSupervision,
  mapEnsurePendingTeamRequestPayload,
  pendingRequestToastMessage,
} from "@/lib/team-requests";

describe("canRequestTeamSupervision", () => {
  it("rejects missing, empty, or self targets", () => {
    const me = "82c3c1c9-d9ca-472d-89cf-df45c4ef3619";
    expect(canRequestTeamSupervision(me, me)).toBe(false);
    expect(canRequestTeamSupervision(me, null)).toBe(false);
    expect(canRequestTeamSupervision(undefined, me)).toBe(false);
    expect(canRequestTeamSupervision(me, "0434c245-8b52-41ba-a638-013d5b364efb")).toBe(
      true
    );
  });
});

describe("mapEnsurePendingTeamRequestPayload", () => {
  it("does not treat invalid_target JSON as success", () => {
    expect(
      mapEnsurePendingTeamRequestPayload({
        success: false,
        status: "invalid_target",
        error: "You cannot send a team request to yourself",
      })
    ).toEqual({
      success: false,
      status: "invalid_target",
      error: "You cannot send a team request to yourself",
    });
  });

  it("maps created payloads as success", () => {
    expect(
      mapEnsurePendingTeamRequestPayload({
        success: true,
        status: "created",
        request_id: "req-1",
        request_type: "supervise",
      })
    ).toMatchObject({ success: true, status: "created", request_id: "req-1" });
  });
});

describe("pendingRequestToastMessage", () => {
  it("explains still-pending without implying a new request was created", () => {
    const message = pendingRequestToastMessage("already_pending");
    expect(message.toLowerCase()).toContain("pending");
    expect(message.toLowerCase()).not.toContain("sent successfully");
  });

  it("explains already-linked", () => {
    expect(pendingRequestToastMessage("already_linked").toLowerCase()).toContain(
      "already linked"
    );
  });

  it("confirms created requests", () => {
    expect(pendingRequestToastMessage("created").toLowerCase()).toContain("sent");
  });

  it("explains self-target", () => {
    expect(pendingRequestToastMessage("invalid_target").toLowerCase()).toContain(
      "yourself"
    );
  });
});
