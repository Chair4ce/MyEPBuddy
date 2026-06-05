/**
 * Restores DEFAULT_ACRONYMS for local user_llm_settings rows saved with an empty array.
 * Run: npx tsx scripts/restore-empty-acronyms-local.ts
 */
import { DEFAULT_ACRONYMS } from "../src/lib/default-acronyms";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function main() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_llm_settings?select=user_id,acronyms&acronyms=eq.%5B%5D`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to query settings: ${res.status} ${await res.text()}`);
  }

  const rows = (await res.json()) as { user_id: string; acronyms: unknown[] }[];
  if (rows.length === 0) {
    console.log("No rows with empty acronyms found.");
    return;
  }

  console.log(`Restoring ${DEFAULT_ACRONYMS.length} default acronyms for ${rows.length} user(s)...`);

  for (const row of rows) {
    const patch = await fetch(
      `${SUPABASE_URL}/rest/v1/user_llm_settings?user_id=eq.${row.user_id}`,
      {
        method: "PATCH",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ acronyms: DEFAULT_ACRONYMS }),
      },
    );

    if (!patch.ok) {
      throw new Error(
        `Failed to update ${row.user_id}: ${patch.status} ${await patch.text()}`,
      );
    }
    console.log(`  ✓ ${row.user_id}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
