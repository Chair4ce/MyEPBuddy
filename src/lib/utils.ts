import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function getCharacterCountColor(count: number, max: number): string {
  const remaining = max - count;
  if (count > max) return "text-destructive"; // Over limit
  if (remaining <= 10) return "text-green-500"; // Within 10 of max - great
  if (remaining <= 20) return "text-yellow-500"; // 10-20 away - good
  if (remaining <= 40) return "text-orange-400"; // 20-40 away - getting there
  return "text-orange-300"; // More than 40 away - needs more
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize text by removing unwanted line breaks that often come from PDF copy/paste.
 * Preserves intentional paragraph breaks (double newlines) while joining lines that
 * were broken mid-sentence.
 */
export function normalizeText(text: string): string {
  if (!text) return text;
  
  // Replace single newlines (often from PDF line breaks) with spaces
  // but preserve double newlines (paragraph breaks)
  return text
    // First, normalize all types of line endings
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Preserve paragraph breaks by temporarily replacing them
    .replace(/\n\n+/g, "<<<PARAGRAPH>>>")
    // Replace single newlines with spaces
    .replace(/\n/g, " ")
    // Restore paragraph breaks
    .replace(/<<<PARAGRAPH>>>/g, "\n\n")
    // Clean up multiple spaces
    .replace(/  +/g, " ")
    // Trim each line
    .split("\n")
    .map(line => line.trim())
    .join("\n")
    .trim();
}

// ============================================
// Name Utilities
// ============================================

interface NameFields {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}

/**
 * Get the full name from a profile or entity with name fields.
 * Prefers first_name + last_name if both exist, falls back to full_name.
 */
export function getFullName(entity: NameFields | null | undefined): string {
  if (!entity) return "";
  
  // Prefer the new separate fields
  if (entity.first_name && entity.last_name) {
    return `${entity.first_name} ${entity.last_name}`;
  }
  
  // Fall back to full_name
  return entity.full_name || "";
}

/**
 * Get the last name from a profile or entity.
 * Prefers last_name field, falls back to parsing from full_name.
 */
export function getLastName(entity: NameFields | null | undefined): string {
  if (!entity) return "";
  
  // Prefer the new last_name field
  if (entity.last_name) {
    return entity.last_name;
  }
  
  // Fall back to parsing from full_name (get everything after first space)
  if (entity.full_name) {
    const parts = entity.full_name.trim().split(" ");
    if (parts.length > 1) {
      return parts.slice(1).join(" "); // Everything after first name (handles middle names)
    }
    return entity.full_name; // Single name, return as-is
  }
  
  return "";
}

/**
 * Get just the surname (last word of name) for military format.
 * Useful for "SSgt Smith" format where middle names should be excluded.
 */
export function getSurname(entity: NameFields | null | undefined): string {
  if (!entity) return "";
  
  // If we have last_name, get the last word (in case it includes middle name)
  if (entity.last_name) {
    const parts = entity.last_name.trim().split(" ");
    return parts[parts.length - 1];
  }
  
  // Fall back to parsing from full_name
  if (entity.full_name) {
    const parts = entity.full_name.trim().split(" ");
    return parts[parts.length - 1];
  }
  
  return "";
}

/**
 * Get the first name from a profile or entity.
 * Prefers first_name field, falls back to parsing from full_name.
 */
export function getFirstName(entity: NameFields | null | undefined): string {
  if (!entity) return "";
  
  // Prefer the new first_name field
  if (entity.first_name) {
    return entity.first_name;
  }
  
  // Fall back to parsing from full_name (first word)
  if (entity.full_name) {
    const parts = entity.full_name.trim().split(" ");
    return parts[0];
  }
  
  return "";
}

/**
 * Get initials from a profile or entity.
 * Uses first letter of first name and first letter of last name.
 */
export function getInitials(entity: NameFields | null | undefined): string {
  if (!entity) return "";
  
  const firstName = getFirstName(entity);
  const lastName = getLastName(entity);
  
  if (firstName && lastName) {
    // Get first letter of first name and first letter of last name (not middle)
    const lastParts = lastName.split(" ");
    const actualLastName = lastParts[lastParts.length - 1];
    return `${firstName[0]}${actualLastName[0]}`.toUpperCase();
  }
  
  // Fall back to full_name parsing
  if (entity?.full_name) {
    return entity.full_name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  
  return "";
}

/**
 * Parse a full name string into first and last name components.
 * Used for migrating legacy data or handling user input.
 */
export function parseFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  if (!fullName) {
    return { firstName: "", lastName: "" };
  }
  
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  
  if (spaceIndex === -1) {
    // Single word - could be either first or last name
    // Conventionally treating it as first name
    return { firstName: trimmed, lastName: "" };
  }
  
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1), // Everything after first space (handles middle names)
  };
}





