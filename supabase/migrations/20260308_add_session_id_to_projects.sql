-- Add session_id to compomate_projects for per-session scoping
-- Run this migration, then update src/app/api/projects/route.ts to filter by session_id
ALTER TABLE compomate_projects 
  ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_compomate_projects_session_id 
  ON compomate_projects(session_id);
