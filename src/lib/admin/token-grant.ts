export interface AdminGrantUserResult {
  user_id: string;
  new_balance: number;
}

export interface AdminGrantCreditsResult {
  granted_count: number;
  amount_per_user: number;
  total_tokens: number;
  users?: AdminGrantUserResult[];
}

export interface AdminGrantSearchUser {
  id: string;
  email: string;
  full_name: string | null;
  rank: string | null;
  balance: number;
}

export function parseGrantAmount(raw: string): number | null {
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 10000) {
    return null;
  }
  return parsed;
}

export function formatGrantUserLabel(user: AdminGrantSearchUser): string {
  const name = user.full_name?.trim();
  if (name) {
    return `${name} (${user.email})`;
  }
  return user.email;
}
