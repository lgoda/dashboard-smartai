/*
  # Create ElevenLabs Conversations Cache Table

  ## Overview
  This migration creates a table to cache ElevenLabs conversations locally for better performance and analytics.

  ## New Tables
  
  ### `elevenlabs_conversations`
  Stores all ElevenLabs AI call conversations for each user.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique identifier for the cache record
  - `user_id` (uuid, foreign key) - References auth.users, the owner of this conversation
  - `conversation_id` (text, unique) - ElevenLabs conversation ID
  - `agent_id` (text) - ElevenLabs agent ID that handled the call
  - `start_time_unix_secs` (bigint) - Unix timestamp when the call started
  - `call_duration_secs` (integer) - Duration of the call in seconds
  - `message_count` (integer) - Number of messages in the conversation
  - `status` (text) - Status of the conversation
  - `call_successful` (text) - Outcome: 'successful', 'failed', or 'unknown'
  - `raw_data` (jsonb) - Full conversation data from ElevenLabs API
  - `created_at` (timestamptz) - When this record was created locally
  - `updated_at` (timestamptz) - When this record was last updated locally

  ### `elevenlabs_sync_status`
  Tracks the last sync status for each user.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, foreign key, unique) - References auth.users
  - `last_sync_at` (timestamptz) - Timestamp of last successful sync
  - `last_sync_cursor` (text) - Last cursor used for pagination
  - `total_conversations` (integer) - Total number of conversations synced
  - `sync_in_progress` (boolean) - Whether a sync is currently running
  - `last_error` (text) - Last error message if sync failed
  - `created_at` (timestamptz) - When the record was created
  - `updated_at` (timestamptz) - When the record was last updated

  ## Indexes
  - Composite index on (user_id, start_time_unix_secs) for efficient date queries
  - Index on (user_id, agent_id) for filtering by agent
  - Index on (user_id, call_successful) for filtering by outcome
  - Index on conversation_id for quick lookups

  ## Security
  - RLS enabled on both tables
  - Users can only read/write their own data
  - Proper access controls to prevent data leaks between users
*/

-- Create elevenlabs_conversations table
CREATE TABLE IF NOT EXISTS elevenlabs_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id text NOT NULL UNIQUE,
  agent_id text NOT NULL,
  start_time_unix_secs bigint NOT NULL,
  call_duration_secs integer NOT NULL DEFAULT 0,
  message_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT '',
  call_successful text NOT NULL DEFAULT 'unknown',
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS elevenlabs_conversations_user_time_idx 
  ON elevenlabs_conversations(user_id, start_time_unix_secs DESC);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_user_agent_idx 
  ON elevenlabs_conversations(user_id, agent_id);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_user_outcome_idx 
  ON elevenlabs_conversations(user_id, call_successful);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_conversation_id_idx 
  ON elevenlabs_conversations(conversation_id);

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

-- Add triggers for updated_at using existing function
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