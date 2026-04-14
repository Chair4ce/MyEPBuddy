/**
 * Script to create test data for the Weekly Activity Report (WAR) feature
 * Run with: npx tsx scripts/seed-war-test-data.ts
 * 
 * This adds recent accomplishments (within the past 4 weeks) to test:
 * - Weekly grouping in the activity feed
 * - WAR generation with real entries
 * - WAR history/archive functionality
 * 
 * Prerequisites: Run seed-test-users.ts first to create the test users
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
  console.error("❌ Safety check failed: seed-war-test-data only runs against local Supabase.");
  console.error(`   Received SUPABASE_URL: ${SUPABASE_URL}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Helper to get a date N days ago
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

// User IDs from seed-test-users.ts
const USERS = {
  msgtSmith: "11111111-1111-1111-1111-111111111111",
  tsgtJones: "22222222-2222-2222-2222-222222222222",
  tsgtWilliams: "33333333-3333-3333-3333-333333333333",
  ssgtBrown: "44444444-4444-4444-4444-444444444444",
  ssgtDavis: "55555555-5555-5555-5555-555555555555",
  sraMiller: "66666666-6666-6666-6666-666666666666",
  a1cWilson: "77777777-7777-7777-7777-777777777777",
  sraTaylor: "88888888-8888-8888-8888-888888888888",
  a1cAnderson: "99999999-9999-9999-9999-999999999999",
};

const MANAGED_MEMBERS = {
  amnThompson: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  a1cJohnson: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
};

async function main() {
  console.log("🚀 Seeding WAR test data...\n");

  // Verify test users exist
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, rank")
    .in("id", Object.values(USERS));

  if (profileError || !profiles || profiles.length === 0) {
    console.error("❌ Test users not found. Run seed-test-users.ts first!");
    console.error("   npx tsx scripts/seed-test-users.ts");
    process.exit(1);
  }

  console.log(`✅ Found ${profiles.length} test users\n`);

  // Create recent accomplishments for the past 4 weeks
  console.log("📋 Creating recent accomplishments for WAR testing...\n");

  const recentAccomplishments = [
    // ============ THIS WEEK (0-6 days ago) ============
    // SSgt Brown's team - help desk activities
    {
      user_id: USERS.sraMiller,
      created_by: USERS.sraMiller,
      date: daysAgo(1),
      action_verb: "Resolved",
      details: "Critical network outage affecting 200 users within 45 minutes",
      impact: "Minimized productivity loss; saved estimated $15K",
      metrics: "200 users, 45-min resolution",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
    {
      user_id: USERS.a1cWilson,
      created_by: USERS.a1cWilson,
      date: daysAgo(2),
      action_verb: "Completed",
      details: "Security+ certification exam with 95% score",
      impact: "Enhanced team technical capability",
      metrics: "95% score, first attempt",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
    {
      user_id: USERS.ssgtBrown,
      created_by: USERS.ssgtBrown,
      date: daysAgo(3),
      action_verb: "Led",
      details: "Weekly team stand-up; identified 3 process improvement opportunities",
      impact: "Streamlined ticket escalation procedures",
      mpa: "leading_people",
      cycle_year: 2026,
    },
    // SSgt Davis's team - infrastructure work
    {
      user_id: USERS.sraTaylor,
      created_by: USERS.sraTaylor,
      date: daysAgo(1),
      action_verb: "Configured",
      details: "15 new workstations for incoming cyber operators",
      impact: "Ensured zero-day productivity for new personnel",
      metrics: "15 workstations configured",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
    {
      user_id: USERS.a1cAnderson,
      created_by: USERS.a1cAnderson,
      date: daysAgo(4),
      action_verb: "Performed",
      details: "Server room cable audit and remediation",
      impact: "Identified 12 unlabeled connections; improved troubleshooting time",
      mpa: "improving_unit",
      cycle_year: 2026,
    },
    // Managed member entry
    {
      user_id: USERS.ssgtDavis,
      created_by: USERS.ssgtDavis,
      team_member_id: MANAGED_MEMBERS.amnThompson,
      date: daysAgo(2),
      action_verb: "Assisted",
      details: "Senior technicians with emergency patch deployment",
      impact: "Supported critical vulnerability remediation",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
    
    // ============ LAST WEEK (7-13 days ago) ============
    {
      user_id: USERS.tsgtJones,
      created_by: USERS.tsgtJones,
      date: daysAgo(8),
      action_verb: "Coordinated",
      details: "Cross-functional incident response drill with 4 sections",
      impact: "Validated emergency procedures; identified 2 gaps",
      metrics: "4 sections, 25 participants",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
    {
      user_id: USERS.ssgtBrown,
      created_by: USERS.ssgtBrown,
      date: daysAgo(9),
      action_verb: "Mentored",
      details: "2 junior airmen on ITIL best practices",
      impact: "Improved service delivery consistency",
      mpa: "leading_people",
      cycle_year: 2026,
    },
    {
      user_id: USERS.sraMiller,
      created_by: USERS.sraMiller,
      date: daysAgo(10),
      action_verb: "Authored",
      details: "New troubleshooting guide for common VPN issues",
      impact: "Reduced average call time by 3 minutes",
      metrics: "3-min reduction per call",
      mpa: "improving_unit",
      cycle_year: 2026,
    },
    {
      user_id: USERS.ssgtDavis,
      created_by: USERS.ssgtDavis,
      date: daysAgo(11),
      action_verb: "Executed",
      details: "Quarterly network performance audit",
      impact: "Identified 5 optimization opportunities",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
    {
      user_id: USERS.sraTaylor,
      created_by: USERS.sraTaylor,
      date: daysAgo(12),
      action_verb: "Trained",
      details: "A1C Anderson on network monitoring tools",
      impact: "Expanded team cross-coverage capability",
      mpa: "leading_people",
      cycle_year: 2026,
    },
    // Issue/roadblock type entry
    {
      user_id: USERS.a1cWilson,
      created_by: USERS.ssgtBrown,
      date: daysAgo(7),
      action_verb: "Documented",
      details: "Recurring software licensing issue affecting 5 systems",
      impact: "Escalated to vendor for resolution",
      mpa: "managing_resources",
      cycle_year: 2026,
    },
    
    // ============ 2 WEEKS AGO (14-20 days ago) ============
    {
      user_id: USERS.msgtSmith,
      created_by: USERS.msgtSmith,
      date: daysAgo(15),
      action_verb: "Briefed",
      details: "Squadron leadership on FY26 IT modernization roadmap",
      impact: "Secured $50K in additional funding",
      metrics: "$50K funding secured",
      mpa: "managing_resources",
      cycle_year: 2026,
    },
    {
      user_id: USERS.tsgtJones,
      created_by: USERS.tsgtJones,
      date: daysAgo(16),
      action_verb: "Reorganized",
      details: "Help desk shift schedule for optimal coverage",
      impact: "Eliminated after-hours coverage gaps",
      mpa: "leading_people",
      cycle_year: 2026,
    },
    {
      user_id: USERS.tsgtWilliams,
      created_by: USERS.tsgtWilliams,
      date: daysAgo(17),
      action_verb: "Directed",
      details: "Emergency server migration after hardware failure",
      impact: "Zero data loss; 4-hour recovery time",
      metrics: "4-hour RTO achieved",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
    {
      user_id: USERS.ssgtBrown,
      created_by: USERS.ssgtBrown,
      date: daysAgo(18),
      action_verb: "Processed",
      details: "45 equipment refresh requests ahead of schedule",
      impact: "Ensured end-of-quarter budget execution",
      metrics: "45 requests processed",
      mpa: "managing_resources",
      cycle_year: 2026,
    },
    {
      user_id: USERS.a1cAnderson,
      created_by: USERS.a1cAnderson,
      date: daysAgo(19),
      action_verb: "Supported",
      details: "Base-wide email migration testing phase",
      impact: "Validated 50 test accounts with zero issues",
      metrics: "50 test accounts validated",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
    {
      user_id: USERS.tsgtJones,
      created_by: USERS.tsgtJones,
      team_member_id: MANAGED_MEMBERS.a1cJohnson,
      date: daysAgo(14),
      action_verb: "Completed",
      details: "Initial AFSC qualification tasks",
      impact: "On track for upgrade ahead of schedule",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
    
    // ============ 3 WEEKS AGO (21-27 days ago) ============
    {
      user_id: USERS.msgtSmith,
      created_by: USERS.msgtSmith,
      date: daysAgo(22),
      action_verb: "Championed",
      details: "New automated patching solution implementation",
      impact: "Reduced manual patching workload by 60%",
      metrics: "60% workload reduction",
      mpa: "improving_unit",
      cycle_year: 2026,
    },
    {
      user_id: USERS.sraMiller,
      created_by: USERS.sraMiller,
      date: daysAgo(23),
      action_verb: "Achieved",
      details: "100% ticket closure rate for assigned queue",
      impact: "Zero ticket aging violations for month",
      metrics: "100% closure rate",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
    {
      user_id: USERS.ssgtDavis,
      created_by: USERS.ssgtDavis,
      date: daysAgo(24),
      action_verb: "Negotiated",
      details: "Extended warranty coverage with vendor at no cost",
      impact: "Saved $8K in potential repair costs",
      metrics: "$8K cost avoidance",
      mpa: "managing_resources",
      cycle_year: 2026,
    },
    {
      user_id: USERS.a1cWilson,
      created_by: USERS.a1cWilson,
      date: daysAgo(25),
      action_verb: "Volunteered",
      details: "15 hours for base Honor Guard duty",
      impact: "Represented unit at 3 ceremonial events",
      metrics: "15 volunteer hours",
      mpa: "improving_unit",
      cycle_year: 2026,
    },
    {
      user_id: USERS.sraTaylor,
      created_by: USERS.sraTaylor,
      date: daysAgo(26),
      action_verb: "Identified",
      details: "Network security vulnerability during routine scan",
      impact: "Enabled proactive remediation before exploit",
      mpa: "executing_mission",
      cycle_year: 2026,
    },
  ];

  let created = 0;
  let errors = 0;

  for (const acc of recentAccomplishments) {
    const { error } = await supabase.from("accomplishments").insert(acc);
    if (error) {
      if (!error.message.includes("duplicate")) {
        console.error(`  ❌ Error: ${error.message}`);
        errors++;
      }
    } else {
      created++;
    }
  }

  console.log(`  ✅ Created ${created} recent accomplishments`);
  if (errors > 0) {
    console.log(`  ⚠️  ${errors} errors occurred`);
  }

  // Create a sample saved WAR report for testing history
  console.log("\n📋 Creating sample WAR report for history testing...\n");

  const lastWeekStart = new Date();
  lastWeekStart.setDate(lastWeekStart.getDate() - lastWeekStart.getDay() - 7 + 1); // Last Monday
  const lastWeekEnd = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() + 6); // Last Sunday

  const sampleWAR = {
    user_id: USERS.tsgtJones,
    week_start: lastWeekStart.toISOString().split("T")[0],
    week_end: lastWeekEnd.toISOString().split("T")[0],
    title: null,
    unit_office_symbol: "42 CS/SCOO",
    prepared_by: "TSgt Sarah Jones",
    content: {
      categories: [
        {
          key: "key_accomplishments",
          label: "Key Accomplishments/Highlights",
          items: [
            "Coordinated cross-functional incident response drill with 4 sections and 25 participants; validated emergency procedures and identified 2 gaps for remediation",
            "SrA Miller authored new VPN troubleshooting guide; reduced average call time by 3 minutes per ticket",
            "A1C Wilson completed Security+ certification with 95% score on first attempt; enhanced team technical capability",
          ],
        },
        {
          key: "issues_roadblocks",
          label: "Issues/Roadblocks",
          items: [
            "Recurring software licensing issue affecting 5 systems; escalated to vendor for resolution (ECD: next week)",
          ],
        },
        {
          key: "upcoming_priorities",
          label: "Upcoming Priorities/Key Events",
          items: [
            "Complete quarterly network performance audit actions",
            "Finalize FY26 training schedule for section personnel",
          ],
        },
      ],
    },
    entry_count: 6,
    model_used: "gemini-2.0-flash",
    status: "draft",
  };

  const { error: warError } = await (supabase.from("war_reports") as any).insert(sampleWAR);
  if (warError) {
    if (!warError.message.includes("duplicate")) {
      console.error(`  ❌ WAR report error: ${warError.message}`);
    }
  } else {
    console.log(`  ✅ Created sample WAR report for TSgt Jones`);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ WAR test data seeding complete!");
  console.log("=".repeat(60));
  console.log("\n📊 Test Scenario:");
  console.log("  • Log in as TSgt Jones (tsgt.jones@test.af.mil / password123)");
  console.log("  • Go to Dashboard → Team Activity Feed");
  console.log("  • Click 'Weekly' tab to see entries grouped by week");
  console.log("  • Click 'View WAR' on any week to generate a report");
  console.log("  • Click 'History' to see the sample saved report");
  console.log("\n📅 Data Created:");
  console.log("  • This week: 6 entries");
  console.log("  • Last week: 6 entries");
  console.log("  • 2 weeks ago: 6 entries");
  console.log("  • 3 weeks ago: 5 entries");
  console.log("  • 1 sample saved WAR report");
  console.log("");
}

main().catch(console.error);
