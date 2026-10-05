import { describe, expect, it, vi } from "vitest";
import { isInactivitySuspended, restoreSuspendedAccount } from "../restore";

describe("inactivity restore", () => {
  it("treats a suspension timestamp as suspended", () => {
    expect(isInactivitySuspended({ id: "u", app_metadata: {} })).toBe(false);
    expect(
      isInactivitySuspended({
        id: "u",
        app_metadata: { inactivity_suspended_at: "2026-12-20T00:00:00.000Z" },
      })
    ).toBe(true);
  });

  it("clears the profile flag, cancels notices, and drops the auth metadata", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                app_metadata: {
                  provider: "email",
                  inactivity_suspended_at: "2026-12-20T00:00:00.000Z",
                },
              },
            },
            error: null,
          }),
          updateUserById,
        },
      },
    };

    const restored = await restoreSuspendedAccount(
      {
        id: "user-1",
        app_metadata: { inactivity_suspended_at: "2026-12-20T00:00:00.000Z" },
      },
      admin
    );

    expect(restored).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("inactivity_cancel_user", {
      p_user_id: "user-1",
      p_reason: "activity",
    });
    expect(updateUserById).toHaveBeenCalledWith("user-1", {
      app_metadata: { provider: "email" },
    });
  });
});
