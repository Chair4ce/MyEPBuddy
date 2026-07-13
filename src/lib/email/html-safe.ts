/** Shared HTML helpers for feedback notification / reply emails. */

export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
