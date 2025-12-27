/**
 * One-time migration script to encrypt existing plain-text API keys
 * 
 * Run with: npx tsx scripts/migrate-encrypt-api-keys.ts
 * 
 * Prerequisites:
 * - ENCRYPTION_KEY must be set in environment
 * - SUPABASE_SERVICE_ROLE_KEY must be set (for admin access)
 * - NEXT_PUBLIC_SUPABASE_URL must be set
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes, createCipheriv } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Manually load .env.local
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.+)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required. " +
      "Generate one with: openssl rand -hex 32"
    );
  }
  
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, "hex");
  } else if (key.length === 44 && /^[A-Za-z0-9+/]+=*$/.test(key)) {
    return Buffer.from(key, "base64");
  }
  
  throw new Error("Invalid ENCRYPTION_KEY format");
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();
  
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, "base64"),
  ]);
  
  return combined.toString("base64");
}

function isAlreadyEncrypted(value: string): boolean {
  if (!value) return false;
  
  // API keys typically start with recognizable prefixes
  const apiKeyPrefixes = ["sk-", "AKIA", "AIza", "xai-", "ant-", "pk-"];
  const startsWithApiKeyPrefix = apiKeyPrefixes.some((prefix) =>
    value.startsWith(prefix)
  );
  
  if (startsWithApiKeyPrefix) {
    return false; // Definitely NOT encrypted
  }
  
  // Check if it's valid base64 with minimum length for encrypted data
  const minLength = 64;
  if (value.length < minLength) {
    return false;
  }
  
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return base64Regex.test(value);
}

async function main() {
  console.log("🔐 API Key Encryption Migration Script\n");
  
  // Validate environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Missing required environment variables:");
    console.error("   - NEXT_PUBLIC_SUPABASE_URL");
    console.error("   - SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  
  // Validate encryption key
  try {
    getEncryptionKey();
    console.log("✅ Encryption key validated\n");
  } catch (error) {
    console.error("❌ " + (error as Error).message);
    process.exit(1);
  }
  
  // Create admin client
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  
  // Fetch all API keys
  console.log("📥 Fetching existing API keys...");
  const { data: rows, error } = await supabase
    .from("user_api_keys")
    .select("id, user_id, openai_key, anthropic_key, google_key, grok_key");
  
  if (error) {
    console.error("❌ Failed to fetch API keys:", error.message);
    process.exit(1);
  }
  
  if (!rows || rows.length === 0) {
    console.log("ℹ️  No API keys found in database. Nothing to migrate.");
    process.exit(0);
  }
  
  console.log(`📊 Found ${rows.length} user(s) with API keys\n`);
  
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  const keyFields = ["openai_key", "anthropic_key", "google_key", "grok_key"] as const;
  
  for (const row of rows) {
    const updates: Record<string, string> = {};
    let keysToMigrate = 0;
    let keysSkipped = 0;
    
    for (const field of keyFields) {
      const value = row[field];
      
      if (!value) {
        continue; // No key set
      }
      
      if (isAlreadyEncrypted(value)) {
        keysSkipped++;
        continue; // Already encrypted
      }
      
      // Encrypt the plain-text key
      try {
        updates[field] = encrypt(value);
        keysToMigrate++;
      } catch (err) {
        console.error(`  ❌ Failed to encrypt ${field} for user ${row.user_id}:`, err);
        totalErrors++;
      }
    }
    
    if (keysToMigrate > 0) {
      // Update the row with encrypted keys
      const { error: updateError } = await supabase
        .from("user_api_keys")
        .update(updates)
        .eq("id", row.id);
      
      if (updateError) {
        console.error(`  ❌ Failed to update user ${row.user_id}:`, updateError.message);
        totalErrors++;
      } else {
        console.log(`  ✅ User ${row.user_id}: encrypted ${keysToMigrate} key(s)`);
        totalMigrated += keysToMigrate;
      }
    }
    
    if (keysSkipped > 0) {
      console.log(`  ⏭️  User ${row.user_id}: skipped ${keysSkipped} already-encrypted key(s)`);
      totalSkipped += keysSkipped;
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("📊 Migration Summary:");
  console.log(`   ✅ Encrypted: ${totalMigrated} key(s)`);
  console.log(`   ⏭️  Skipped (already encrypted): ${totalSkipped} key(s)`);
  console.log(`   ❌ Errors: ${totalErrors}`);
  console.log("=".repeat(50));
  
  if (totalErrors > 0) {
    console.log("\n⚠️  Some keys failed to migrate. Please review the errors above.");
    process.exit(1);
  }
  
  console.log("\n🎉 Migration complete!");
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});

