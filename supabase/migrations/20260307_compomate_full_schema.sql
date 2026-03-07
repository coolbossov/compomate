-- CompoMate full schema migration
-- Replaces legacy compomate_projects table approach with 4 purpose-built tables
-- user_id is nullable on all tables (Phase 1 = anonymous, Phase 3 = auth)

-- Sessions table
CREATE TABLE IF NOT EXISTS compomate_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE,
  job_name TEXT NOT NULL DEFAULT 'Untitled Job',
  composition JSONB NOT NULL DEFAULT '{}',
  export_profile_id TEXT NOT NULL DEFAULT 'original',
  name_style_id TEXT NOT NULL DEFAULT 'classic',
  font_pair_id TEXT NOT NULL DEFAULT 'classic',
  lock_settings BOOLEAN NOT NULL DEFAULT false,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Templates table
CREATE TABLE IF NOT EXISTS compomate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL,
  name TEXT NOT NULL,
  composition JSONB NOT NULL DEFAULT '{}',
  export_profile_id TEXT NOT NULL DEFAULT 'original',
  name_style_id TEXT NOT NULL DEFAULT 'classic',
  font_pair_id TEXT NOT NULL DEFAULT 'classic',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backdrops table (metadata only — files in R2)
CREATE TABLE IF NOT EXISTS compomate_backdrops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('upload', 'ai-flux', 'ai-ideogram', 'reference')),
  prompt TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usage logs table (for future metering / SaaS billing)
CREATE TABLE IF NOT EXISTS compomate_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT,
  event_type TEXT NOT NULL,   -- 'export', 'generate-backdrop', 'analyze-reference'
  model TEXT,                  -- 'flux', 'ideogram', 'gemini-flash', 'sharp'
  duration_ms INTEGER,
  output_width INTEGER,
  output_height INTEGER,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_token ON compomate_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_templates_session ON compomate_templates(session_token);
CREATE INDEX IF NOT EXISTS idx_backdrops_session ON compomate_backdrops(session_token);
CREATE INDEX IF NOT EXISTS idx_usage_logs_session ON compomate_usage_logs(session_token);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON compomate_usage_logs(created_at DESC);

-- RLS policies (permissive for Phase 1 — anonymous access)
ALTER TABLE compomate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compomate_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE compomate_backdrops ENABLE ROW LEVEL SECURITY;
ALTER TABLE compomate_usage_logs ENABLE ROW LEVEL SECURITY;

-- Allow all operations via service role key (server-side only)
CREATE POLICY "service_role_all" ON compomate_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON compomate_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON compomate_backdrops FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON compomate_usage_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON compomate_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER templates_updated_at BEFORE UPDATE ON compomate_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
