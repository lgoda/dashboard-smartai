/*
  # Create GoHighLevel Integration Table

  ## Overview
  Stores API tokens and Location IDs for GoHighLevel (GHL) CRM integration per user.

  ## New Tables

  ### `ghl_tokens`
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK → auth.users)
  - `api_token` (text) — Private Integration Token
  - `location_id` (text) — GHL Location ID
  - `is_active` (boolean)
  - `last_verified_at` (timestamptz)
  - `created_at` / `updated_at` (timestamptz)

  ## Security
  - RLS enabled
  - Users can only read/write their own record
*/

-- Ensure update_updated_at_column function exists (defined in earlier migrations)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create ghl_tokens table
CREATE TABLE IF NOT EXISTS ghl_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_token text NOT NULL,
  location_id text NOT NULL,
  is_active boolean DEFAULT true,
  last_verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One token record per user
CREATE UNIQUE INDEX IF NOT EXISTS ghl_tokens_user_id_idx ON ghl_tokens(user_id);

-- Enable RLS
ALTER TABLE ghl_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for idempotency
DROP POLICY IF EXISTS "Users can view own GHL token" ON ghl_tokens;
DROP POLICY IF EXISTS "Users can insert own GHL token" ON ghl_tokens;
DROP POLICY IF EXISTS "Users can update own GHL token" ON ghl_tokens;
DROP POLICY IF EXISTS "Users can delete own GHL token" ON ghl_tokens;

-- RLS Policies
CREATE POLICY "Users can view own GHL token"
  ON ghl_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own GHL token"
  ON ghl_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own GHL token"
  ON ghl_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own GHL token"
  ON ghl_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_ghl_tokens_updated_at ON ghl_tokens;
CREATE TRIGGER update_ghl_tokens_updated_at
  BEFORE UPDATE ON ghl_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
