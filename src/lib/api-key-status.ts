import type { KeyStatus } from "@/app/actions/api-keys";

export const EMPTY_KEY_STATUS: KeyStatus = {
  openai_key: false,
  anthropic_key: false,
  google_key: false,
  grok_key: false,
};

interface UserApiKeysRow {
  openai_key: string | null;
  anthropic_key: string | null;
  google_key: string | null;
  grok_key: string | null;
}

export function keyStatusFromRow(data: UserApiKeysRow | null): KeyStatus {
  if (!data) return EMPTY_KEY_STATUS;

  return {
    openai_key: !!data.openai_key,
    anthropic_key: !!data.anthropic_key,
    google_key: !!data.google_key,
    grok_key: !!data.grok_key,
  };
}
