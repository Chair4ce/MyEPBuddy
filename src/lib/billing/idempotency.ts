const IDEMPOTENCY_KEY_PATTERN = /^[\w-]{8,128}$/;

/** Read a client-supplied idempotency key for billable AI requests. */
export function getIdempotencyKeyFromRequest(request: Request): string | null {
  const header = request.headers.get("Idempotency-Key")?.trim();
  if (!header || !IDEMPOTENCY_KEY_PATTERN.test(header)) {
    return null;
  }
  return header;
}

/** Generate a key when the client did not supply one (single-request scope). */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute the effective billing idempotency key.
 *
 * Binds the (client-supplied or generated) key to the user and a hash of the
 * request body. This way a genuine retry of the SAME request dedupes (no double
 * charge), but a malicious client reusing one Idempotency-Key across DIFFERENT
 * requests cannot skip the charge — the body hash differs, so it is treated as
 * a new billable request.
 */
export async function computeEffectiveIdempotencyKey(
  request: Request,
  userId: string,
): Promise<string> {
  const clientKey = getIdempotencyKeyFromRequest(request) ?? createIdempotencyKey();

  let body = "";
  try {
    body = await request.clone().text();
  } catch {
    body = "";
  }

  const hash = await sha256Hex(`${userId}:${clientKey}:${body}`);
  return `idk_${hash}`;
}

/** Ensure billable fetch calls carry a stable idempotency key across retries. */
export function withBillableIdempotencyKey(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (!headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", createIdempotencyKey());
  }
  return { ...init, headers };
}
