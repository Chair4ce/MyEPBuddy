/**
 * Script to create test users for local development
 * Run with: npx tsx scripts/seed-test-users.ts
 * 
 * This creates a full organizational hierarchy:
 * 
 *   MSgt Smith (Flight Chief)
 *   ├── TSgt Jones (Section A NCOIC)
 *   │   └── SSgt Brown (Team Lead)
 *   │       ├── SrA Miller
 *   │       ├── A1C Wilson
 *   │       └── [Managed: A1C Johnson]
 *   └── TSgt Williams (Section B NCOIC)
 *       └── SSgt Davis (Team Lead)
 *           ├── SrA Taylor
 *           ├── A1C Anderson
 *           └── [Managed: Amn Thompson]
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing required environment variables:");
  console.error("   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  console.error("   - SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!isLocalSupabaseUrl(SUPABASE_URL)) {
  console.error("❌ Safety check failed: seed-test-users only runs against local Supabase.");
  console.error(`   Received SUPABASE_URL: ${SUPABASE_URL}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface TestUser {
  id: string;
  email: string;
  password: string;
  full_name: string;
  rank: string;
  afsc: string;
  unit: string;
}

// Fresh user for onboarding testing (no rank, no terms accepted)
interface FreshTestUser {
  id: string;
  email: string;
  password: string;
  full_name: string;
}

const freshOnboardingUser: FreshTestUser = {
  id: "f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0",
  email: "new.user@test.af.mil",
  password: "password123",
  full_name: "New User",
};

const testUsers: TestUser[] = [
  // Flight Chief
  {
    id: "11111111-1111-1111-1111-111111111111",
    email: "msgt.smith@test.af.mil",
    password: "password123",
    full_name: "John Smith",
    rank: "MSgt",
    afsc: "3D0X2",
    unit: "42 CS/SCOO",
  },
  // Section NCOICs
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "tsgt.jones@test.af.mil",
    password: "password123",
    full_name: "Sarah Jones",
    rank: "TSgt",
    afsc: "3D0X2",
    unit: "42 CS/SCOO",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    email: "tsgt.williams@test.af.mil",
    password: "password123",
    full_name: "Mike Williams",
    rank: "TSgt",
    afsc: "3D0X2",
    unit: "42 CS/SCOO",
  },
  // Team Leaders
  {
    id: "44444444-4444-4444-4444-444444444444",
    email: "ssgt.brown@test.af.mil",
    password: "password123",
    full_name: "Emily Brown",
    rank: "SSgt",
    afsc: "3D0X2",
    unit: "42 CS/SCOO",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    email: "ssgt.davis@test.af.mil",
    password: "password123",
    full_name: "Chris Davis",
    rank: "SSgt",
    afsc: "3D0X2",
    unit: "42 CS/SCOO",
  },
  // Airmen
  {
    id: "66666666-6666-6666-6666-666666666666",
    email: "sra.miller@test.af.mil",
    password: "password123",
    full_name: "Alex Miller",
    rank: "SrA",
    afsc: "3D0X2",
    unit: "42 CS/SCOO",
  },
  {
    id: "77777777-7777-7777-7777-777777777777",
    email: "a1c.wilson@test.af.mil",
    password: "password123",
    full_name: "Jordan Wilson",
    rank: "A1C",
    afsc: "3D0X2",
    unit: "42 CS/SCOO",
  },
  {
    id: "88888888-8888-8888-8888-888888888888",
    email: "sra.taylor@test.af.mil",
    password: "password123",
    full_name: "Sam Taylor",
    rank: "SrA",
    afsc: "3D0X2",
    unit: "42 CS/SCOO",
  },
  {
    id: "99999999-9999-9999-9999-999999999999",
    email: "a1c.anderson@test.af.mil",
    password: "password123",
    full_name: "Casey Anderson",
    rank: "A1C",
    afsc: "3D0X2",
    unit: "42 CS/SCOO",
  },
];

async function main() {
  console.log("🚀 Seeding local database...\n");

  // Step 0: Create fresh onboarding test user
  console.log("📋 Step 0: Creating fresh onboarding test user...\n");
  await createFreshOnboardingUser();

  // Step 1: Create auth users
  console.log("\n📋 Step 1: Creating auth users...\n");
  for (const user of testUsers) {
    await createAuthUser(user);
  }

  // Step 2: Set up team relationships
  console.log("\n📋 Step 2: Setting up team relationships...\n");
  await setupTeamRelationships();

  // Step 3: Create managed members
  console.log("\n📋 Step 3: Creating managed members...\n");
  await createManagedMembers();

  // Step 4: Create accomplishments
  console.log("\n📋 Step 4: Creating sample accomplishments...\n");
  await createAccomplishments();

  // Step 5: Create statements
  console.log("\n📋 Step 5: Creating sample statements...\n");
  await createStatements();

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ Database seeding complete!");
  console.log("=".repeat(60));
  
  console.log("\n🆕 ONBOARDING TEST ACCOUNT (no rank, no terms accepted):\n");
  console.log("┌────────────────────────────────┬──────────────┬─────────┐");
  console.log("│ Email                          │ Password     │ Rank    │");
  console.log("├────────────────────────────────┼──────────────┼─────────┤");
  console.log(`│ ${freshOnboardingUser.email.padEnd(30)} │ ${freshOnboardingUser.password.padEnd(12)} │ ${"(none)".padEnd(7)} │`);
  console.log("└────────────────────────────────┴──────────────┴─────────┘");
  console.log("   → Login to test: Terms Agreement → Rank Selection → Dashboard");
  
  console.log("\n📧 Test Accounts (with existing data):\n");
  console.log("┌────────────────────────────────┬──────────────┬─────────┐");
  console.log("│ Email                          │ Password     │ Rank    │");
  console.log("├────────────────────────────────┼──────────────┼─────────┤");
  for (const user of testUsers) {
    console.log(`│ ${user.email.padEnd(30)} │ ${user.password.padEnd(12)} │ ${user.rank.padEnd(7)} │`);
  }
  console.log("└────────────────────────────────┴──────────────┴─────────┘");
  
  console.log("\n📊 Visibility Matrix:");
  console.log("  • MSgt Smith sees: Everyone (all 9 users + 2 managed)");
  console.log("  • TSgt Jones sees: Self, SSgt Brown, SrA Miller, A1C Wilson, A1C Johnson");
  console.log("  • TSgt Williams sees: Self, SSgt Davis, SrA Taylor, A1C Anderson, Amn Thompson");
  console.log("  • TSgt Jones CANNOT see TSgt Williams' chain (co-worker isolation)");
  console.log("  • SrA Miller can only see their own data\n");
}

async function createFreshOnboardingUser() {
  const user = freshOnboardingUser;
  try {
    // Delete existing user if present (ignore errors)
    await supabase.auth.admin.deleteUser(user.id).catch(() => {});

    // Create user with admin API - NO email confirmation so they go through verification
    const { error } = await supabase.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: user.password,
      email_confirm: true, // Skip email verification for testing
      user_metadata: {
        full_name: user.full_name,
        // NO rank, afsc, unit - this user will go through onboarding
      },
    });

    if (error) {
      console.error(`  ❌ ${user.email}: ${error.message}`);
      return;
    }

    // The profile is auto-created by trigger with null rank, null terms_accepted_at
    // Perfect for testing the onboarding flow!
    console.log(`  ✅ Fresh onboarding user: ${user.email} (password: ${user.password})`);
    console.log(`     → No rank set, no terms accepted - will see full onboarding flow`);
  } catch (err) {
    console.error(`  ❌ Error creating ${user.email}:`, err);
  }
}

async function createAuthUser(user: TestUser) {
  try {
    // Delete existing user if present (ignore errors)
    await supabase.auth.admin.deleteUser(user.id).catch(() => {});

    // Create user with admin API
    const { error } = await supabase.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        full_name: user.full_name,
      },
    });

    if (error) {
      console.error(`  ❌ ${user.email}: ${error.message}`);
      return;
    }

    // Update profile with rank, afsc, unit (profile is auto-created by trigger)
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: user.full_name,
        rank: user.rank,
        afsc: user.afsc,
        unit: user.unit,
      })
      .eq("id", user.id);

    if (profileError) {
      console.error(`  ⚠️  Profile update for ${user.email}: ${profileError.message}`);
    } else {
      console.log(`  ✅ ${user.rank} ${user.full_name} (${user.email})`);
    }
  } catch (err) {
    console.error(`  ❌ Error creating ${user.email}:`, err);
  }
}

async function setupTeamRelationships() {
  const relationships = [
    // MSgt Smith supervises TSgts
    { supervisor_id: "11111111-1111-1111-1111-111111111111", subordinate_id: "22222222-2222-2222-2222-222222222222", desc: "MSgt Smith → TSgt Jones" },
    { supervisor_id: "11111111-1111-1111-1111-111111111111", subordinate_id: "33333333-3333-3333-3333-333333333333", desc: "MSgt Smith → TSgt Williams" },
    // TSgts supervise SSgts
    { supervisor_id: "22222222-2222-2222-2222-222222222222", subordinate_id: "44444444-4444-4444-4444-444444444444", desc: "TSgt Jones → SSgt Brown" },
    { supervisor_id: "33333333-3333-3333-3333-333333333333", subordinate_id: "55555555-5555-5555-5555-555555555555", desc: "TSgt Williams → SSgt Davis" },
    // SSgts supervise Airmen
    { supervisor_id: "44444444-4444-4444-4444-444444444444", subordinate_id: "66666666-6666-6666-6666-666666666666", desc: "SSgt Brown → SrA Miller" },
    { supervisor_id: "44444444-4444-4444-4444-444444444444", subordinate_id: "77777777-7777-7777-7777-777777777777", desc: "SSgt Brown → A1C Wilson" },
    { supervisor_id: "55555555-5555-5555-5555-555555555555", subordinate_id: "88888888-8888-8888-8888-888888888888", desc: "SSgt Davis → SrA Taylor" },
    { supervisor_id: "55555555-5555-5555-5555-555555555555", subordinate_id: "99999999-9999-9999-9999-999999999999", desc: "SSgt Davis → A1C Anderson" },
  ];

  for (const rel of relationships) {
    const { error } = await supabase.from("teams").upsert(
      { supervisor_id: rel.supervisor_id, subordinate_id: rel.subordinate_id },
      { onConflict: "supervisor_id,subordinate_id" }
    );
    if (error) {
      console.error(`  ❌ ${rel.desc}: ${error.message}`);
    } else {
      console.log(`  ✅ ${rel.desc}`);
    }
  }
}

async function createManagedMembers() {
  const members = [
    {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      supervisor_id: "55555555-5555-5555-5555-555555555555",
      parent_profile_id: "55555555-5555-5555-5555-555555555555",
      full_name: "Pat Thompson",
      email: "amn.thompson@test.af.mil",
      rank: "Amn",
      afsc: "3D0X2",
      unit: "42 CS/SCOO",
      desc: "Amn Thompson (managed by SSgt Davis)",
    },
    {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      supervisor_id: "22222222-2222-2222-2222-222222222222",
      parent_profile_id: "44444444-4444-4444-4444-444444444444",
      full_name: "Riley Johnson",
      email: "a1c.johnson@test.af.mil",
      rank: "A1C",
      afsc: "3D0X2",
      unit: "42 CS/SCOO",
      desc: "A1C Johnson (created by TSgt Jones, under SSgt Brown)",
    },
  ];

  for (const member of members) {
    const { error } = await supabase.from("team_members").upsert(
      {
        id: member.id,
        supervisor_id: member.supervisor_id,
        parent_profile_id: member.parent_profile_id,
        full_name: member.full_name,
        email: member.email,
        rank: member.rank,
        afsc: member.afsc,
        unit: member.unit,
        is_placeholder: true,
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error(`  ❌ ${member.desc}: ${error.message}`);
    } else {
      console.log(`  ✅ ${member.desc}`);
    }
  }
}

async function createAccomplishments() {
  const accomplishments = [
    // MSgt Smith's entries
    { user_id: "11111111-1111-1111-1111-111111111111", created_by: "11111111-1111-1111-1111-111111111111", date: "2025-01-15", action_verb: "Led", details: "Flight-wide training initiative on cybersecurity awareness", impact: "Improved unit security posture", mpa: "executing_mission", cycle_year: 2025 },
    { user_id: "11111111-1111-1111-1111-111111111111", created_by: "11111111-1111-1111-1111-111111111111", date: "2025-02-10", action_verb: "Mentored", details: "5 NCOs on leadership development", impact: "Prepared next generation of leaders", mpa: "leading_people", cycle_year: 2025 },
    
    // TSgt Jones's entries
    { user_id: "22222222-2222-2222-2222-222222222222", created_by: "22222222-2222-2222-2222-222222222222", date: "2025-01-20", action_verb: "Managed", details: "Section A operations supporting 24/7 network coverage", impact: "Zero network outages", mpa: "executing_mission", cycle_year: 2025 },
    { user_id: "22222222-2222-2222-2222-222222222222", created_by: "22222222-2222-2222-2222-222222222222", date: "2025-03-01", action_verb: "Coordinated", details: "Cross-functional training with Section B", impact: "Increased interoperability", mpa: "improving_unit", cycle_year: 2025 },
    
    // TSgt Williams's entries (co-worker with TSgt Jones - should NOT be visible to Jones)
    { user_id: "33333333-3333-3333-3333-333333333333", created_by: "33333333-3333-3333-3333-333333333333", date: "2025-01-25", action_verb: "Directed", details: "Section B server migration project", impact: "Migrated 50 servers with zero downtime", mpa: "executing_mission", cycle_year: 2025 },
    { user_id: "33333333-3333-3333-3333-333333333333", created_by: "33333333-3333-3333-3333-333333333333", date: "2025-02-15", action_verb: "Optimized", details: "Resource allocation across team", impact: "Reduced operating costs by 15%", mpa: "managing_resources", cycle_year: 2025 },
    
    // SSgt Brown's entries
    { user_id: "44444444-4444-4444-4444-444444444444", created_by: "44444444-4444-4444-4444-444444444444", date: "2025-02-01", action_verb: "Supervised", details: "Help desk operations for 500+ users", impact: "Maintained 95% satisfaction rating", mpa: "executing_mission", cycle_year: 2025 },
    
    // SSgt Davis's entries
    { user_id: "55555555-5555-5555-5555-555555555555", created_by: "55555555-5555-5555-5555-555555555555", date: "2025-02-05", action_verb: "Executed", details: "Network infrastructure upgrade", impact: "Doubled network capacity", mpa: "executing_mission", cycle_year: 2025 },
    
    // SrA Miller's entries
    { user_id: "66666666-6666-6666-6666-666666666666", created_by: "66666666-6666-6666-6666-666666666666", date: "2025-01-10", action_verb: "Resolved", details: "150 help desk tickets in first quarter", impact: "Reduced backlog by 40%", mpa: "executing_mission", cycle_year: 2025 },
    { user_id: "66666666-6666-6666-6666-666666666666", created_by: "66666666-6666-6666-6666-666666666666", date: "2025-02-20", action_verb: "Trained", details: "3 new airmen on ticketing system", impact: "Accelerated onboarding by 2 weeks", mpa: "leading_people", cycle_year: 2025 },
    
    // A1C Wilson's entries (some by supervisor - SSgt Brown)
    { user_id: "77777777-7777-7777-7777-777777777777", created_by: "77777777-7777-7777-7777-777777777777", date: "2025-01-05", action_verb: "Assisted", details: "Senior technicians with server maintenance", impact: "Gained hands-on experience", mpa: "executing_mission", cycle_year: 2025 },
    { user_id: "77777777-7777-7777-7777-777777777777", created_by: "44444444-4444-4444-4444-444444444444", date: "2025-03-10", action_verb: "Volunteered", details: "Base cleanup event", impact: "Demonstrated community involvement", mpa: "improving_unit", cycle_year: 2025 },
    
    // SrA Taylor's entries
    { user_id: "88888888-8888-8888-8888-888888888888", created_by: "88888888-8888-8888-8888-888888888888", date: "2025-01-15", action_verb: "Configured", details: "25 new workstations for incoming personnel", impact: "Ensured day-one productivity", mpa: "executing_mission", cycle_year: 2025 },
    
    // A1C Anderson's entries
    { user_id: "99999999-9999-9999-9999-999999999999", created_by: "99999999-9999-9999-9999-999999999999", date: "2025-02-01", action_verb: "Supported", details: "Base-wide IT upgrade project", impact: "Contributed to successful rollout", mpa: "executing_mission", cycle_year: 2025 },
  ];

  let created = 0;
  for (const acc of accomplishments) {
    const { error } = await supabase.from("accomplishments").insert(acc);
    if (error && !error.message.includes("duplicate")) {
      console.error(`  ❌ Entry for ${acc.user_id.slice(0, 8)}...: ${error.message}`);
    } else {
      created++;
    }
  }
  console.log(`  ✅ Created ${created} accomplishments for real users`);

  // Managed member entries
  const managedAccomplishments = [
    // Amn Thompson (managed by SSgt Davis)
    { user_id: "55555555-5555-5555-5555-555555555555", created_by: "55555555-5555-5555-5555-555555555555", team_member_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", date: "2025-01-20", action_verb: "Performed", details: "Cable management in server room", impact: "Improved airflow and organization", mpa: "executing_mission", cycle_year: 2025 },
    { user_id: "55555555-5555-5555-5555-555555555555", created_by: "55555555-5555-5555-5555-555555555555", team_member_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", date: "2025-02-15", action_verb: "Assisted", details: "Network equipment installation", impact: "Supported infrastructure upgrade", mpa: "executing_mission", cycle_year: 2025 },
    // A1C Johnson (created by TSgt Jones)
    { user_id: "22222222-2222-2222-2222-222222222222", created_by: "22222222-2222-2222-2222-222222222222", team_member_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", date: "2025-03-01", action_verb: "Completed", details: "Initial technical training certification", impact: "Ready for independent work assignments", mpa: "executing_mission", cycle_year: 2025 },
  ];

  let managedCreated = 0;
  for (const acc of managedAccomplishments) {
    const { error } = await supabase.from("accomplishments").insert(acc);
    if (error && !error.message.includes("duplicate")) {
      console.error(`  ❌ Managed entry: ${error.message}`);
    } else {
      managedCreated++;
    }
  }
  console.log(`  ✅ Created ${managedCreated} accomplishments for managed members`);
}

async function createStatements() {
  const statements = [
    // MSgt Smith's statements
    { user_id: "11111111-1111-1111-1111-111111111111", created_by: "11111111-1111-1111-1111-111111111111", mpa: "executing_mission", afsc: "3D0X2", rank: "MSgt", statement: "Spearheaded flight-wide cybersecurity awareness initiative; trained 45 personnel--reduced security incidents 30%", cycle_year: 2025 },
    { user_id: "11111111-1111-1111-1111-111111111111", created_by: "11111111-1111-1111-1111-111111111111", mpa: "leading_people", afsc: "3D0X2", rank: "MSgt", statement: "Championed professional development for 5 NCOs; guided career progression--3 selected for advanced training", cycle_year: 2025 },
    
    // SrA Miller's statements
    { user_id: "66666666-6666-6666-6666-666666666666", created_by: "66666666-6666-6666-6666-666666666666", mpa: "executing_mission", afsc: "3D0X2", rank: "SrA", statement: "Resolved 150 help desk tickets; maintained 98% first-contact resolution--reduced response time 25%", cycle_year: 2025 },
  ];

  let created = 0;
  for (const stmt of statements) {
    const { error } = await supabase.from("refined_statements").insert(stmt);
    if (error && !error.message.includes("duplicate")) {
      console.error(`  ❌ Statement: ${error.message}`);
    } else {
      created++;
    }
  }
  console.log(`  ✅ Created ${created} statements for real users`);

  // Managed member statement
  const { error } = await supabase.from("refined_statements").insert({
    user_id: "55555555-5555-5555-5555-555555555555",
    created_by: "55555555-5555-5555-5555-555555555555",
    team_member_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    mpa: "executing_mission",
    afsc: "3D0X2",
    rank: "Amn",
    statement: "Performed cable management in server room; reorganized 200+ connections--improved airflow efficiency 40%",
    cycle_year: 2025,
  });
  if (error && !error.message.includes("duplicate")) {
    console.error(`  ❌ Managed statement: ${error.message}`);
  } else {
    console.log(`  ✅ Created 1 statement for managed member`);
  }
}

main().catch(console.error);
