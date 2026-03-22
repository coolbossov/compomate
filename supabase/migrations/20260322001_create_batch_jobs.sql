-- ============================================================
-- CompoMate — Batch Export Jobs Table
-- ============================================================

CREATE TABLE IF NOT EXISTS compomate_batch_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  total INT NOT NULL DEFAULT 0,
  done_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  download_url TEXT,
  error TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compomate_batch_jobs_session_id ON compomate_batch_jobs(session_id);

ALTER TABLE compomate_batch_jobs ENABLE ROW LEVEL SECURITY;

-- Only the service_role can read/write batch jobs (same pattern as r2_objects)
CREATE POLICY "service_role_all" ON compomate_batch_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
