import { describe, expect, it } from "vitest";
import { pendingRequestToastMessage } from "@/lib/team-requests";

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
});
