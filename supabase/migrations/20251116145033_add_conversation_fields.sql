/*
  # Add Enhanced Conversation Fields

  ## Overview
  This migration adds new fields from ElevenLabs API to improve the conversations list UI with more meaningful information.

  ## Changes to `elevenlabs_conversations` Table

  ### New Columns Added:
  - `agent_name` (text) - Human-readable agent name instead of just UUID
  - `transcript_summary` (text) - AI-generated summary of the conversation transcript
  - `call_summary_title` (text) - Brief title summarizing the call
  - `direction` (text) - Call direction: 'inbound' or 'outbound'
  - `rating` (numeric) - Call rating/quality score
  - `branch_id` (text) - Branch identifier for the conversation

  ## Notes
  - All new fields are nullable to maintain compatibility with existing data
  - Existing conversations will have NULL values for these fields until re-synced
  - These fields improve UI by showing meaningful summaries instead of UUIDs
  - Full text search can now include agent_name and transcript_summary for better searchability

  ## Security
  - No changes to RLS policies needed
  - Existing policies cover all new columns
*/

-- Add new columns to elevenlabs_conversations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'elevenlabs_conversations' AND column_name = 'agent_name'
  ) THEN
    ALTER TABLE elevenlabs_conversations ADD COLUMN agent_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'elevenlabs_conversations' AND column_name = 'transcript_summary'
  ) THEN
    ALTER TABLE elevenlabs_conversations ADD COLUMN transcript_summary text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'elevenlabs_conversations' AND column_name = 'call_summary_title'
  ) THEN
    ALTER TABLE elevenlabs_conversations ADD COLUMN call_summary_title text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'elevenlabs_conversations' AND column_name = 'direction'
  ) THEN
    ALTER TABLE elevenlabs_conversations ADD COLUMN direction text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'elevenlabs_conversations' AND column_name = 'rating'
  ) THEN
    ALTER TABLE elevenlabs_conversations ADD COLUMN rating numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'elevenlabs_conversations' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE elevenlabs_conversations ADD COLUMN branch_id text;
  END IF;
END $$;

-- Create index for full-text search on agent_name and transcript_summary
CREATE INDEX IF NOT EXISTS elevenlabs_conversations_agent_name_idx 
  ON elevenlabs_conversations(agent_name);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_direction_idx 
  ON elevenlabs_conversations(user_id, direction);