const TERMS_SESSION_PREFIX = "epb_terms_accepted_session_";
const LEGACY_TERMS_SESSION_KEY = "epb_terms_accepted_session";

export function getTermsSessionKey(userId: string): string {
  return `${TERMS_SESSION_PREFIX}${userId}`;
}

export function clearAllTermsSessionFlags(): void {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(TERMS_SESSION_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    sessionStorage.removeItem(LEGACY_TERMS_SESSION_KEY);
  } catch {
    // sessionStorage may be unavailable
  }
}
