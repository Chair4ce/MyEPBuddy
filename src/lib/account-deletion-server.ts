import { getStripe } from "@/lib/stripe/server";
import { redactInactivityError } from "@/lib/inactivity/redact";
import type { createAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createAdminClient>;

type ProfileRoleRow = { role: string | null };
type StripeCustomerRow = { stripe_customer_id: string | null };

/**
 * Shared destructive steps for self-delete and the inactivity job:
 * avatars, Stripe customer, then the auth user. Does not sign the user
 * out and does not write an exit survey. Refuses administrator accounts.
 */
export async function deleteAccountData(
  admin: AdminClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { ok: false, error: "Could not confirm the account role." };
  }

  const role = (profile as ProfileRoleRow | null)?.role;
  if (role === "admin") {
    return {
      ok: false,
      error: "Administrator accounts cannot be deleted.",
    };
  }

  await deleteUserAvatars(admin, userId);
  await deleteStripeCustomer(admin, userId);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    if (/not found/i.test(deleteError.message ?? "")) {
      return { ok: true };
    }
    return {
      ok: false,
      error: redactInactivityError(deleteError.message || "Failed to delete account."),
    };
  }

  return { ok: true };
}

async function deleteUserAvatars(admin: AdminClient, userId: string) {
  const { data: files, error } = await admin.storage.from("avatars").list(userId);
  if (error || !files?.length) return;

  const paths = files.map((file) => `${userId}/${file.name}`);
  await admin.storage.from("avatars").remove(paths);
}

async function deleteStripeCustomer(admin: AdminClient, userId: string) {
  const { data: stripeRow } = await (
    admin as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: StripeCustomerRow | null }>;
          };
        };
      };
    }
  )
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const customerId = (stripeRow as StripeCustomerRow | null)?.stripe_customer_id;
  if (!customerId) return;

  try {
    const stripe = getStripe();
    await stripe.customers.del(customerId);
  } catch (error) {
    console.error("Failed to delete Stripe customer during account deletion:", error);
  }
}
