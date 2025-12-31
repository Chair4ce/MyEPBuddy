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





