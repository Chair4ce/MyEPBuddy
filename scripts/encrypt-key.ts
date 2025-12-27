/**
 * Utility to manually encrypt an API key
 * 
 * Usage:
 *   ENCRYPTION_KEY=your_64_char_hex_key npx tsx scripts/encrypt-key.ts "sk-your-api-key"
 * 
 * Or if ENCRYPTION_KEY is already in your .env.local:
 *   npx tsx scripts/encrypt-key.ts "sk-your-api-key"
 */

import { randomBytes, createCipheriv } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Manually load .env.local if ENCRYPTION_KEY not already set
if (!process.env.ENCRYPTION_KEY) {
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/^ENCRYPTION_KEY=(.+)$/m);
    if (match) {
      process.env.ENCRYPTION_KEY = match[1].trim();
    }
  }
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    console.error("❌ ENCRYPTION_KEY environment variable is not set");
    console.error("");
    console.error("Usage:");
    console.error('  ENCRYPTION_KEY=your_key npx tsx scripts/encrypt-key.ts "sk-your-api-key"');
    console.error("");
    console.error("Or add ENCRYPTION_KEY to your .env.local file");
    process.exit(1);
  }
  
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, "hex");
  } else if (key.length === 44 && /^[A-Za-z0-9+/]+=*$/.test(key)) {
    return Buffer.from(key, "base64");
  }
  
  console.error("❌ Invalid ENCRYPTION_KEY format");
  console.error("   Must be 64-character hex string or 44-character base64");
  process.exit(1);
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

// Main
const apiKey = process.argv[2];

if (!apiKey) {
  console.error("❌ No API key provided");
  console.error("");
  console.error("Usage:");
  console.error('  npx tsx scripts/encrypt-key.ts "sk-your-api-key-here"');
  console.error("");
  console.error("With custom encryption key:");
  console.error('  ENCRYPTION_KEY=abc123... npx tsx scripts/encrypt-key.ts "sk-your-api-key"');
  process.exit(1);
}

console.log("🔐 Encrypting API key...\n");
console.log("Input (first 10 chars):", apiKey.substring(0, 10) + "...");
console.log("");

const encrypted = encrypt(apiKey);

console.log("✅ Encrypted value:");
console.log("");
console.log(encrypted);
console.log("");
console.log("📋 Copy this value to update the database directly if needed.");

