/**
 * Script to create a large organizational hierarchy for testing
 * Run with: npx tsx scripts/seed-large-hierarchy.ts
 * 
 * This creates a full squadron-level hierarchy:
 * 
 *   CMSgt (1) - Squadron Superintendent
 *   └── SMSgt (3) - Flight Chiefs
 *       └── MSgt (2 per SMSgt = 6) - Section Chiefs
 *           └── TSgt (2-3 per MSgt = ~15) - Section NCOICs
 *               └── SSgt (4-5 per TSgt = ~65) - Team Leads
 *                   └── SrA/A1C/Amn/AB (2-3 each per SSgt)
 * 
 * NOTE: This script is ADDITIVE - it won't delete existing data
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Common last names for generating test users
const LAST_NAMES = [
  "Adams", "Baker", "Carter", "Davis", "Edwards", "Foster", "Garcia", "Harris",
  "Irving", "Jackson", "Kelly", "Lewis", "Martinez", "Nelson", "O'Brien", "Parker",
  "Quinn", "Roberts", "Stevens", "Thompson", "Underwood", "Vasquez", "Walker", "Xavier",
  "Young", "Zimmerman", "Allen", "Brooks", "Clark", "Douglas", "Evans", "Fisher",
  "Green", "Hall", "Ingram", "Johnson", "King", "Lopez", "Moore", "Newman",
  "Owens", "Price", "Reed", "Scott", "Turner", "Upton", "Vincent", "White",
  "York", "Zhang", "Arnold", "Bennett", "Cooper", "Dean", "Ellis", "Ford",
  "Grant", "Hayes", "Jensen", "Kane", "Lambert", "Mitchell", "Norton", "Oliver",
  "Patterson", "Quincy", "Russell", "Sanders", "Taylor", "Ulrich", "Wagner", "Warren"
];

const FIRST_NAMES = [
  "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph",
  "Thomas", "Christopher", "Charles", "Daniel", "Matthew", "Anthony", "Mark", "Donald",
  "Steven", "Paul", "Andrew", "Joshua", "Kenneth", "Kevin", "Brian", "George",
  "Timothy", "Ronald", "Edward", "Jason", "Jeffrey", "Ryan", "Jacob", "Gary",
  "Nicholas", "Eric", "Jonathan", "Stephen", "Larry", "Justin", "Scott", "Brandon",
  "Benjamin", "Samuel", "Raymond", "Gregory", "Frank", "Alexander", "Patrick", "Jack",
  "Mary", "Patricia", "Jennifer", "Linda", "Elizabeth", "Barbara", "Susan", "Jessica",
  "Sarah", "Karen", "Lisa", "Nancy", "Betty", "Margaret", "Sandra", "Ashley",
  "Kimberly", "Emily", "Donna", "Michelle", "Dorothy", "Carol", "Amanda", "Melissa",
  "Deborah", "Stephanie", "Rebecca", "Sharon", "Laura", "Cynthia", "Kathleen", "Amy"
];

interface TestUser {
  id: string;
  email: string;
  password: string;
  full_name: string;
  rank: string;
  afsc: string;
  unit: string;
}

interface TeamRelationship {
  supervisor_id: string;
  subordinate_id: string;
}

// Generate a deterministic UUID based on a seed
function generateUUID(seed: string): string {
  // Simple hash function to create consistent UUIDs
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-a${hex.slice(1, 4)}-${hex.padEnd(12, '0').slice(0, 12)}`;
}

// Generate users and relationships
function generateHierarchy() {
  const users: TestUser[] = [];
  const relationships: TeamRelationship[] = [];
  let nameIndex = 0;

  const getNextName = () => {
    const firstName = FIRST_NAMES[nameIndex % FIRST_NAMES.length];
    const lastName = LAST_NAMES[Math.floor(nameIndex / FIRST_NAMES.length) % LAST_NAMES.length];
    nameIndex++;
    return `${firstName} ${lastName}`;
  };

  const createUser = (rank: string, prefix: string, index: number): TestUser => {
    const name = getNextName();
    const id = generateUUID(`${prefix}-${rank}-${index}`);
    const emailName = name.toLowerCase().replace(' ', '.');
    return {
      id,
      email: `${rank.toLowerCase()}.${emailName}.${index}@test.af.mil`,
      password: "password123",
      full_name: name,
      rank,
      afsc: "3D0X2",
      unit: "42 CS/SCXS",
    };
  };

  // 1 CMSgt - Squadron Superintendent
  const cmsgt = createUser("CMSgt", "cmsgt", 0);
  users.push(cmsgt);

  // 3 SMSgts - Flight Chiefs
  const smsgts: TestUser[] = [];
  for (let i = 0; i < 3; i++) {
    const smsgt = createUser("SMSgt", "smsgt", i);
    users.push(smsgt);
    smsgts.push(smsgt);
    relationships.push({ supervisor_id: cmsgt.id, subordinate_id: smsgt.id });
  }

  // 2 MSgts per SMSgt = 6 MSgts
  const msgts: TestUser[] = [];
  smsgts.forEach((smsgt, sIdx) => {
    for (let i = 0; i < 2; i++) {
      const msgt = createUser("MSgt", `msgt-s${sIdx}`, i);
      users.push(msgt);
      msgts.push(msgt);
      relationships.push({ supervisor_id: smsgt.id, subordinate_id: msgt.id });
    }
  });

  // 2-3 TSgts per MSgt = ~15 TSgts
  const tsgts: TestUser[] = [];
  msgts.forEach((msgt, mIdx) => {
    const count = mIdx % 2 === 0 ? 3 : 2; // Alternate between 2 and 3
    for (let i = 0; i < count; i++) {
      const tsgt = createUser("TSgt", `tsgt-m${mIdx}`, i);
      users.push(tsgt);
      tsgts.push(tsgt);
      relationships.push({ supervisor_id: msgt.id, subordinate_id: tsgt.id });
    }
  });

  // 4-5 SSgts per TSgt = ~65 SSgts
  const ssgts: TestUser[] = [];
  tsgts.forEach((tsgt, tIdx) => {
    const count = tIdx % 2 === 0 ? 5 : 4; // Alternate between 4 and 5
    for (let i = 0; i < count; i++) {
      const ssgt = createUser("SSgt", `ssgt-t${tIdx}`, i);
      users.push(ssgt);
      ssgts.push(ssgt);
      relationships.push({ supervisor_id: tsgt.id, subordinate_id: ssgt.id });
    }
  });

  // 2-3 of each SrA, A1C, Amn, AB per SSgt
  const juniorRanks = ["SrA", "A1C", "Amn", "AB"];
  ssgts.forEach((ssgt, sIdx) => {
    juniorRanks.forEach((rank, rIdx) => {
      const count = (sIdx + rIdx) % 2 === 0 ? 3 : 2; // Alternate between 2 and 3
      for (let i = 0; i < count; i++) {
        const airman = createUser(rank, `${rank.toLowerCase()}-s${sIdx}`, i);
        users.push(airman);
        relationships.push({ supervisor_id: ssgt.id, subordinate_id: airman.id });
      }
    });
  });

  return { users, relationships };
}

async function createAuthUser(user: TestUser): Promise<boolean> {
  try {
    // Check if user already exists
    const { data: existing } = await supabase.auth.admin.getUserById(user.id);
    if (existing?.user) {
      return true; // Already exists, skip
    }

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
      if (error.message.includes("already exists")) {
        return true;
      }
      console.error(`  ❌ ${user.email}: ${error.message}`);
      return false;
    }

    // Update profile with rank, afsc, unit
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
    }
    return true;
  } catch (err) {
    console.error(`  ❌ Error creating ${user.email}:`, err);
    return false;
  }
}

async function createTeamRelationship(rel: TeamRelationship): Promise<boolean> {
  try {
    const { error } = await supabase.from("teams").upsert(
      { supervisor_id: rel.supervisor_id, subordinate_id: rel.subordinate_id },
      { onConflict: "supervisor_id,subordinate_id" }
    );
    if (error) {
      console.error(`  ❌ Relationship error: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  console.log("🚀 Generating large hierarchy test data...\n");

  const { users, relationships } = generateHierarchy();

  console.log(`📊 Hierarchy Summary:`);
  console.log(`   CMSgt: 1`);
  console.log(`   SMSgt: ${users.filter(u => u.rank === "SMSgt").length}`);
  console.log(`   MSgt:  ${users.filter(u => u.rank === "MSgt").length}`);
  console.log(`   TSgt:  ${users.filter(u => u.rank === "TSgt").length}`);
  console.log(`   SSgt:  ${users.filter(u => u.rank === "SSgt").length}`);
  console.log(`   SrA:   ${users.filter(u => u.rank === "SrA").length}`);
  console.log(`   A1C:   ${users.filter(u => u.rank === "A1C").length}`);
  console.log(`   Amn:   ${users.filter(u => u.rank === "Amn").length}`);
  console.log(`   AB:    ${users.filter(u => u.rank === "AB").length}`);
  console.log(`   ─────────────────`);
  console.log(`   Total: ${users.length} users`);
  console.log(`   Relationships: ${relationships.length}\n`);

  // Step 1: Create auth users
  console.log("📋 Step 1: Creating auth users (this may take a moment)...\n");
  
  let created = 0;
  let skipped = 0;
  
  // Process in batches to avoid overwhelming the server
  const batchSize = 10;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(createAuthUser));
    created += results.filter(r => r).length;
    
    // Progress indicator
    const progress = Math.round(((i + batch.length) / users.length) * 100);
    process.stdout.write(`\r   Progress: ${progress}% (${i + batch.length}/${users.length})`);
  }
  console.log(`\n   ✅ Created/verified ${created} users\n`);

  // Step 2: Set up team relationships
  console.log("📋 Step 2: Setting up team relationships...\n");
  
  let relCreated = 0;
  for (let i = 0; i < relationships.length; i += batchSize) {
    const batch = relationships.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(createTeamRelationship));
    relCreated += results.filter(r => r).length;
    
    const progress = Math.round(((i + batch.length) / relationships.length) * 100);
    process.stdout.write(`\r   Progress: ${progress}% (${i + batch.length}/${relationships.length})`);
  }
  console.log(`\n   ✅ Created ${relCreated} relationships\n`);

  // Print login info for top-level users
  console.log("=".repeat(60));
  console.log("✅ Large hierarchy seeding complete!");
  console.log("=".repeat(60));
  console.log("\n📧 Key Test Accounts (password: password123):\n");
  
  const keyUsers = users.filter(u => ["CMSgt", "SMSgt", "MSgt"].includes(u.rank)).slice(0, 10);
  console.log("┌────────────────────────────────────────────┬─────────┐");
  console.log("│ Email                                      │ Rank    │");
  console.log("├────────────────────────────────────────────┼─────────┤");
  for (const user of keyUsers) {
    console.log(`│ ${user.email.padEnd(42)} │ ${user.rank.padEnd(7)} │`);
  }
  console.log("└────────────────────────────────────────────┴─────────┘");
  
  console.log("\n💡 Log in as the CMSgt to see the full hierarchy tree!\n");
}

main().catch(console.error);
