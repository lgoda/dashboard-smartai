/*
  # Create Retell AI Integration Table

  ## Overview
  This migration creates table to support Retell AI calls integration for users.

  ## New Tables
  
  ### `retell_tokens`
  Stores API tokens for Retell AI integration per user.
  - `id` (uuid, primary key) - Unique identifier for the token record
  - `user_id` (uuid, foreign key) - References auth.users, the owner of this token
  - `api_token` (text) - Retell AI API token
  - `is_active` (boolean) - Whether this token is currently active
  - `last_verified_at` (timestamptz) - Last time the token was verified as working
  - `created_at` (timestamptz) - When the token was created
  - `updated_at` (timestamptz) - When the token was last updated

  ## Security
  - RLS enabled on table
  - Users can only read/write their own data
  - Tokens are stored securely with proper access controls
*/

-- Ensure update_updated_at_column function exists (from previous migrations)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create retell_tokens table
CREATE TABLE IF NOT EXISTS retell_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_token text NOT NULL,
  is_active boolean DEFAULT true,
  last_verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique index on user_id for retell_tokens
CREATE UNIQUE INDEX IF NOT EXISTS retell_tokens_user_id_idx ON retell_tokens(user_id);

-- Enable RLS on retell_tokens
ALTER TABLE retell_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view own Retell token" ON retell_tokens;
DROP POLICY IF EXISTS "Users can insert own Retell token" ON retell_tokens;
DROP POLICY IF EXISTS "Users can update own Retell token" ON retell_tokens;
DROP POLICY IF EXISTS "Users can delete own Retell token" ON retell_tokens;

-- RLS Policies for retell_tokens
CREATE POLICY "Users can view own Retell token"
  ON retell_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Retell token"
  ON retell_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Retell token"
  ON retell_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own Retell token"
  ON retell_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_retell_tokens_updated_at ON retell_tokens;
CREATE TRIGGER update_retell_tokens_updated_at
  BEFORE UPDATE ON retell_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
