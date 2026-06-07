-- Response-idempotency cache.
--
-- A genuine retry of a billable request (same effective idempotency key) used to
-- re-run the LLM even though the original had already succeeded — wasted compute
-- with no extra charge. Cache successful responses keyed by the effective
-- idempotency key so a retry returns the stored result without re-running the
-- model. Short-lived; pruned by housekeeping (migration 179).
--
-- Service-role only: RLS enabled with no policies, accessed via the admin client
-- from the server. Users never read it directly.

CREATE TABLE IF NOT EXISTS billable_request_cache (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  action_type TEXT,
  response JSONB NOT NULL,
  credits_remaining INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_billable_request_cache_created
  ON billable_request_cache (created_at);

ALTER TABLE billable_request_cache ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (admin client) may read/write.
