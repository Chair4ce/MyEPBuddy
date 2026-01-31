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





