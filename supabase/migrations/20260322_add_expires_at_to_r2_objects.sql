-- Add expires_at to compomate_r2_objects
-- subjects/backdrops: 24h TTL, exports: 1h TTL

ALTER TABLE compomate_r2_objects
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill existing rows with a sensible default (48h from creation)
UPDATE compomate_r2_objects
  SET expires_at = created_at + INTERVAL '48 hours'
  WHERE expires_at IS NULL;

-- Add index for efficient expiry queries
CREATE INDEX IF NOT EXISTS idx_compomate_r2_objects_expires_at
  ON compomate_r2_objects(expires_at)
  WHERE expires_at IS NOT NULL;
