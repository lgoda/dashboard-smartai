/*
  # Update campaigns table: add draft and deleted states

  Adds 'draft' (initial state before launch) and 'deleted' (soft delete) to the
  status check constraint, and changes the default to 'draft'.
*/

-- Drop existing check constraint
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;

-- Add new constraint with all states
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft','active','paused','completed','deleted'));

-- New campaigns start as draft (not yet launched)
ALTER TABLE campaigns ALTER COLUMN status SET DEFAULT 'draft';

-- Add last_processed_at so the scheduler can track when each campaign was last run
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_processed_at timestamptz;
