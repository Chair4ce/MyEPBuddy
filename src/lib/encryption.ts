/**
 * Encryption utilities for sensitive data (e.g., API keys)
 * Uses AES-256-GCM for authenticated encryption
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get the encryption key from environment variables
 * The key must be a 64-character hex string (32 bytes / 256 bits)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required. " +
      "Generate one with: openssl rand -hex 32"
    );
  }
  
  // Support both hex-encoded keys (64 chars) and base64 keys (44 chars)
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, "hex");
  } else if (key.length === 44 && /^[A-Za-z0-9+/]+=*$/.test(key)) {
    return Buffer.from(key, "base64");
  }
  
  throw new Error(
    "ENCRYPTION_KEY must be a 64-character hex string or 44-character base64 string. " +
    "Generate one with: openssl rand -hex 32"
  );
}

/**
 * Encrypt a plaintext string
 * Returns a base64 string containing: IV + AuthTag + Ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty string");
  }
  
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + AuthTag + Ciphertext into a single base64 string
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, "base64"),
  ]);
  
  return combined.toString("base64");
}

/**
 * Decrypt an encrypted string
 * Expects base64 string containing: IV + AuthTag + Ciphertext
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error("Cannot decrypt empty string");
  }
  
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, "base64");
  
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted data format");
  }
  
  // Extract IV, AuthTag, and Ciphertext
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString("utf8");
}

/**
 * Check if a string appears to be encrypted (base64 with proper length)
 * Used for migration detection - existing unencrypted keys won't match this format
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  
  // Encrypted values are base64 and contain IV + AuthTag + at least some ciphertext
  // Minimum length: 16 (IV) + 16 (AuthTag) + 16 (min ciphertext for short API key) = 48 bytes
  // Base64 encoding: 48 * 4/3 = 64 characters minimum
  const minLength = 64;
  
  // API keys typically start with recognizable prefixes (sk-, AKIA-, etc.)
  // If it starts with a common API key prefix, it's likely NOT encrypted
  const apiKeyPrefixes = ["sk-", "AKIA", "AIza", "xai-", "ant-", "pk-"];
  const startsWithApiKeyPrefix = apiKeyPrefixes.some((prefix) =>
    value.startsWith(prefix)
  );
  
  if (startsWithApiKeyPrefix) {
    return false;
  }
  
  // Check if it's valid base64 and has minimum length
  if (value.length < minLength) {
    return false;
  }
  
  // Check if it's valid base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return base64Regex.test(value);
}

/**
 * Safely encrypt a value, returning the original if encryption fails
 * Logs errors but doesn't throw
 */
export function safeEncrypt(plaintext: string): string | null {
  try {
    return encrypt(plaintext);
  } catch (error) {
    console.error("Encryption failed:", error);
    return null;
  }
}

/**
 * Safely decrypt a value, handling both encrypted and unencrypted values
 * Returns null if decryption fails
 */
export function safeDecrypt(value: string): string | null {
  if (!value) return null;
  
  // If it doesn't look encrypted, assume it's plaintext (for migration compatibility)
  if (!isEncrypted(value)) {
    return value;
  }
  
  try {
    return decrypt(value);
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}

/**
 * Generate a new encryption key (for setup purposes)
 * Returns a hex-encoded 256-bit key
 */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}




