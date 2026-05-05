/*
  # Campaign Queue — Safe Claiming & Batch Logs

  Adds:
  - 'processing' state to campaign_contacts (atomic claim)
  - New columns on campaign_contacts: processing_started_at, batch_id, attempt_count
  - campaign_batch_logs table
  - claim_next_contacts() — atomic claim using FOR UPDATE SKIP LOCKED
  - release_stale_contacts() — reset timed-out processing → queued
*/

-- ── 1. Update campaign_contacts ───────────────────────────────────────────────

-- Add 'processing' to status check
ALTER TABLE campaign_contacts DROP CONSTRAINT IF EXISTS campaign_contacts_status_check;
ALTER TABLE campaign_contacts ADD CONSTRAINT campaign_contacts_status_check
  CHECK (status IN ('queued','processing','sent_to_crm','error','excluded','completed'));

-- New tracking columns
ALTER TABLE campaign_contacts
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS batch_id text,
  ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0;

-- Index for scheduler: quickly find queued contacts per campaign
CREATE INDEX IF NOT EXISTS campaign_contacts_scheduler_idx
  ON campaign_contacts (campaign_id, status, created_at)
  WHERE status = 'queued';

-- Index for stale-contact cleanup
CREATE INDEX IF NOT EXISTS campaign_contacts_processing_idx
  ON campaign_contacts (status, processing_started_at)
  WHERE status = 'processing';

-- ── 2. campaign_batch_logs ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_batch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  import_id uuid,                          -- null = mixed imports in same batch
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_workflow_id text,
  crm_workflow_name text,
  batch_id text NOT NULL,                  -- unique identifier for this batch run
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  contacts_claimed integer DEFAULT 0,
  contacts_sent integer DEFAULT 0,
  contacts_error integer DEFAULT 0,
  contacts_excluded integer DEFAULT 0,
  status text DEFAULT 'running'
    CHECK (status IN ('running','completed','partial','error')),
  error_message text,
  triggered_by text DEFAULT 'scheduler'   -- 'scheduler' | 'manual' | 'n8n'
);

CREATE INDEX IF NOT EXISTS campaign_batch_logs_campaign_idx ON campaign_batch_logs(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_batch_logs_batch_id_idx ON campaign_batch_logs(batch_id);

ALTER TABLE campaign_batch_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own batch logs" ON campaign_batch_logs;
DROP POLICY IF EXISTS "Users can insert own batch logs" ON campaign_batch_logs;
DROP POLICY IF EXISTS "Users can update own batch logs" ON campaign_batch_logs;

CREATE POLICY "Users can view own batch logs"
  ON campaign_batch_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own batch logs"
  ON campaign_batch_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own batch logs"
  ON campaign_batch_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ── 3. claim_next_contacts() ─────────────────────────────────────────────────
--
-- Called by the scheduler (n8n or manual endpoint).
-- Uses FOR UPDATE SKIP LOCKED: concurrent calls claim DIFFERENT contacts.
-- Returns the claimed rows so the caller knows exactly what to process.
--
-- Usage:
--   SELECT * FROM claim_next_contacts(
--     '<campaign_id>'::uuid,
--     100,                      -- how many to claim
--     'batch_abc123'            -- unique batch identifier
--   );

CREATE OR REPLACE FUNCTION claim_next_contacts(
  p_campaign_id uuid,
  p_limit       integer,
  p_batch_id    text
)
RETURNS SETOF campaign_contacts
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE campaign_contacts
  SET
    status                = 'processing',
    processing_started_at = now(),
    batch_id              = p_batch_id,
    attempt_count         = attempt_count + 1,
    updated_at            = now()
  WHERE id IN (
    SELECT id
    FROM campaign_contacts
    WHERE campaign_id = p_campaign_id
      AND status      = 'queued'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED         -- key: concurrent-safe, no double-claims
  )
  RETURNING *;
END;
$$;

-- ── 4. release_stale_contacts() ──────────────────────────────────────────────
--
-- Resets contacts that have been stuck in 'processing' for longer than
-- p_timeout_minutes (default 30). Call periodically (e.g. hourly) to recover
-- from crashed scheduler runs.
--
-- Usage:
--   SELECT release_stale_contacts(30);  -- reset if stuck > 30 min

CREATE OR REPLACE FUNCTION release_stale_contacts(
  p_timeout_minutes integer DEFAULT 30
)
RETURNS integer        -- number of contacts released
LANGUAGE plpgsql
AS $$
DECLARE
  released integer;
BEGIN
  WITH updated AS (
    UPDATE campaign_contacts
    SET
      status                = 'queued',
      processing_started_at = NULL,
      batch_id              = NULL,
      updated_at            = now()
    WHERE status = 'processing'
      AND processing_started_at < now() - (p_timeout_minutes || ' minutes')::interval
    RETURNING id
  )
  SELECT count(*) INTO released FROM updated;

  RETURN released;
END;
$$;

-- ── 5. Helper view: campaigns ready to process ────────────────────────────────
--
-- Used by n8n / process endpoint to quickly find actionable campaigns.
-- Returns only active campaigns that have at least one queued contact.

CREATE OR REPLACE VIEW campaigns_ready_to_process AS
SELECT
  c.id,
  c.user_id,
  c.name,
  c.type,
  c.send_days,
  c.send_time_from,
  c.send_time_to,
  c.daily_limit,
  c.timezone,
  c.last_processed_at,
  COUNT(cc.id) AS queued_count
FROM campaigns c
JOIN campaign_contacts cc ON cc.campaign_id = c.id AND cc.status = 'queued'
WHERE c.status = 'active'
GROUP BY c.id
HAVING COUNT(cc.id) > 0;
