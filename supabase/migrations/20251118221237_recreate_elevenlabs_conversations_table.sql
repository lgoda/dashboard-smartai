/*
  # Recreate ElevenLabs Conversations Table for Offset-Based Pagination

  ## Overview
  This migration recreates the conversations caching system to enable efficient offset-based pagination.
  Data is synced from ElevenLabs API to local Supabase for fast queries with all filters and sorting.

  ## New Tables

  ### `elevenlabs_conversations`
  Stores all ElevenLabs AI call conversations for efficient querying and pagination.

  **Columns:**
  - `id` (uuid, primary key) - Unique identifier for the record
  - `user_id` (uuid, foreign key) - Owner of the conversation (references auth.users)
  - `conversation_id` (text, unique) - ElevenLabs conversation ID
  - `agent_id` (text) - ElevenLabs agent ID
  - `agent_name` (text) - Human-readable agent name
  - `start_time_unix_secs` (bigint) - Unix timestamp when call started
  - `call_duration_secs` (integer) - Call duration in seconds
  - `message_count` (integer) - Number of messages exchanged
  - `status` (text) - Conversation status
  - `call_successful` (text) - Outcome: 'successful', 'failed', or 'unknown'
  - `transcript_summary` (text) - AI-generated summary of conversation
  - `call_summary_title` (text) - Brief title for the call
  - `direction` (text) - Call direction: 'inbound' or 'outbound'
  - `rating` (numeric) - Call quality rating
  - `branch_id` (text) - Branch identifier
  - `raw_data` (jsonb) - Complete API response for reference
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `elevenlabs_sync_status`
  Tracks synchronization state for each user.

  **Columns:**
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, unique foreign key) - User this sync status belongs to
  - `last_sync_at` (timestamptz) - When last sync completed successfully
  - `last_sync_cursor` (text) - Last cursor from ElevenLabs API
  - `total_conversations` (integer) - Total conversations synced
  - `sync_in_progress` (boolean) - Whether sync is currently running
  - `last_error` (text) - Last error message if sync failed
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Indexes
  Performance indexes for fast filtering and sorting:
  - Composite index on (user_id, start_time_unix_secs DESC) for date queries
  - Index on (user_id, agent_id) for agent filtering
  - Index on (user_id, call_successful) for outcome filtering
  - Index on (user_id, direction) for direction filtering
  - Index on conversation_id for quick lookups
  - Index on agent_name for searching
  - Index on (user_id, call_duration_secs) for duration filtering
  - Index on (user_id, rating) for rating filtering

  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Users can only access their own data
  - Policies for SELECT, INSERT, UPDATE, DELETE operations
  - Cascading delete on user removal

  ## Important Notes
  - This enables offset-based pagination with total count
  - All filters work efficiently using database indexes
  - Sync process is incremental using cursors
  - Data freshness controlled by sync frequency
*/

-- Enable pg_trgm extension first (for text search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create elevenlabs_conversations table
CREATE TABLE IF NOT EXISTS elevenlabs_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id text NOT NULL UNIQUE,
  agent_id text NOT NULL,
  agent_name text,
  start_time_unix_secs bigint NOT NULL,
  call_duration_secs integer NOT NULL DEFAULT 0,
  message_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT '',
  call_successful text NOT NULL DEFAULT 'unknown',
  transcript_summary text,
  call_summary_title text,
  direction text,
  rating numeric,
  branch_id text,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS elevenlabs_conversations_user_time_idx 
  ON elevenlabs_conversations(user_id, start_time_unix_secs DESC);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_user_agent_idx 
  ON elevenlabs_conversations(user_id, agent_id);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_user_outcome_idx 
  ON elevenlabs_conversations(user_id, call_successful);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_user_direction_idx 
  ON elevenlabs_conversations(user_id, direction);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_conversation_id_idx 
  ON elevenlabs_conversations(conversation_id);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_agent_name_idx 
  ON elevenlabs_conversations(agent_name);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_user_duration_idx 
  ON elevenlabs_conversations(user_id, call_duration_secs);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_user_rating_idx 
  ON elevenlabs_conversations(user_id, rating);

-- Create composite index for user_id + conversation_id for upserts
CREATE UNIQUE INDEX IF NOT EXISTS elevenlabs_conversations_user_conversation_idx
  ON elevenlabs_conversations(user_id, conversation_id);

-- Create GIN index for full-text search on multiple fields
CREATE INDEX IF NOT EXISTS elevenlabs_conversations_search_idx 
  ON elevenlabs_conversations USING gin(
    (
      COALESCE(agent_name, '') || ' ' || 
      COALESCE(call_summary_title, '') || ' ' || 
      COALESCE(transcript_summary, '')
    ) gin_trgm_ops
  );

-- Enable RLS on elevenlabs_conversations
ALTER TABLE elevenlabs_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for elevenlabs_conversations
CREATE POLICY "Users can view own conversations"
  ON elevenlabs_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON elevenlabs_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON elevenlabs_conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON elevenlabs_conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create elevenlabs_sync_status table
CREATE TABLE IF NOT EXISTS elevenlabs_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  last_sync_at timestamptz,
  last_sync_cursor text,
  total_conversations integer DEFAULT 0,
  sync_in_progress boolean DEFAULT false,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique index on user_id for elevenlabs_sync_status
CREATE UNIQUE INDEX IF NOT EXISTS elevenlabs_sync_status_user_id_idx 
  ON elevenlabs_sync_status(user_id);

-- Enable RLS on elevenlabs_sync_status
ALTER TABLE elevenlabs_sync_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies for elevenlabs_sync_status
CREATE POLICY "Users can view own sync status"
  ON elevenlabs_sync_status FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync status"
  ON elevenlabs_sync_status FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync status"
  ON elevenlabs_sync_status FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sync status"
  ON elevenlabs_sync_status FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add trigger function for updated_at if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_elevenlabs_conversations_updated_at ON elevenlabs_conversations;
CREATE TRIGGER update_elevenlabs_conversations_updated_at
  BEFORE UPDATE ON elevenlabs_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_elevenlabs_sync_status_updated_at ON elevenlabs_sync_status;
CREATE TRIGGER update_elevenlabs_sync_status_updated_at
  BEFORE UPDATE ON elevenlabs_sync_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();