/** Fast model used for writing-style fingerprint analysis */
export const STYLE_SIGNATURE_MODEL = "gpt-4o-mini";

/**
 * Max app-key LLM calls per user per UTC day for style signatures.
 * Style refresh is non-billable (auto-triggered on EPB finalize); this cap
 * prevents abuse without charging AI call credits.
 */
export const STYLE_SIGNATURE_DAILY_APP_LIMIT = 12;
