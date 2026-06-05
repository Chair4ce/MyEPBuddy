-- Global catalog sync coordination (rate limit + avoid concurrent provider syncs at scale)

CREATE TABLE llm_catalog_sync_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_sync_started_at TIMESTAMPTZ,
  last_sync_completed_at TIMESTAMPTZ,
  last_sync_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO llm_catalog_sync_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE llm_catalog_sync_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE llm_catalog_sync_state IS 'Single-row lock/cooldown for app-wide LLM catalog provider sync.';

CREATE TRIGGER update_llm_catalog_sync_state_updated_at
  BEFORE UPDATE ON llm_catalog_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
