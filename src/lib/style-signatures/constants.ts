/** Fast model used for writing-style fingerprint analysis */
export const STYLE_SIGNATURE_MODEL = "gpt-4o-mini";

/**
 * Daily cap still hard-coded inside `try_record_style_signature_app_call`.
 * Style signatures no longer call that RPC: the app has no OpenAI key, so
 * this path runs only with the user's own OpenAI key and does not apply the cap.
 */
export const STYLE_SIGNATURE_DAILY_APP_LIMIT = 12;
