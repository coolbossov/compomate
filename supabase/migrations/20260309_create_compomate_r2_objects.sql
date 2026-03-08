-- CompoMate R2 ownership bindings
-- Maps generated R2 object keys to the originating anonymous session.

CREATE TABLE IF NOT EXISTS compomate_r2_objects (
  key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('subject', 'backdrop', 'export')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compomate_r2_objects_session_id
  ON compomate_r2_objects(session_id);

CREATE INDEX IF NOT EXISTS idx_compomate_r2_objects_created_at
  ON compomate_r2_objects(created_at DESC);

ALTER TABLE compomate_r2_objects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'compomate_r2_objects'
      AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all"
      ON compomate_r2_objects
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
