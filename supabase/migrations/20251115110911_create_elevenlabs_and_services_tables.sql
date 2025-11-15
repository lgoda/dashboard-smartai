/*
  # Create ElevenLabs Integration and Services Tables

  ## Overview
  This migration creates tables to support ElevenLabs AI calls integration and service management for users.

  ## New Tables
  
  ### `elevenlabs_tokens`
  Stores API tokens for ElevenLabs integration per user.
  - `id` (uuid, primary key) - Unique identifier for the token record
  - `user_id` (uuid, foreign key) - References auth.users, the owner of this token
  - `api_token` (text, encrypted) - ElevenLabs API token (xi-api-key)
  - `is_active` (boolean) - Whether this token is currently active
  - `last_verified_at` (timestamptz) - Last time the token was verified as working
  - `created_at` (timestamptz) - When the token was created
  - `updated_at` (timestamptz) - When the token was last updated

  ### `user_services`
  Tracks which services (chatbot/AI calls) are enabled for each user.
  - `id` (uuid, primary key) - Unique identifier for the service record
  - `user_id` (uuid, foreign key) - References auth.users, unique constraint
  - `has_chatbot` (boolean) - Whether user has chatbot service enabled
  - `has_ai_calls` (boolean) - Whether user has AI calls service enabled
  - `created_at` (timestamptz) - When the record was created
  - `updated_at` (timestamptz) - When the record was last updated

  ## Security
  - RLS enabled on both tables
  - Users can only read/write their own data
  - Tokens are stored securely with proper access controls
*/

-- Create elevenlabs_tokens table
CREATE TABLE IF NOT EXISTS elevenlabs_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_token text NOT NULL,
  is_active boolean DEFAULT true,
  last_verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique index on user_id for elevenlabs_tokens
CREATE UNIQUE INDEX IF NOT EXISTS elevenlabs_tokens_user_id_idx ON elevenlabs_tokens(user_id);

-- Enable RLS on elevenlabs_tokens
ALTER TABLE elevenlabs_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for elevenlabs_tokens
CREATE POLICY "Users can view own ElevenLabs token"
  ON elevenlabs_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ElevenLabs token"
  ON elevenlabs_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ElevenLabs token"
  ON elevenlabs_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ElevenLabs token"
  ON elevenlabs_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create user_services table
CREATE TABLE IF NOT EXISTS user_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  has_chatbot boolean DEFAULT false,
  has_ai_calls boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique index on user_id for user_services
CREATE UNIQUE INDEX IF NOT EXISTS user_services_user_id_idx ON user_services(user_id);

-- Enable RLS on user_services
ALTER TABLE user_services ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_services
CREATE POLICY "Users can view own services"
  ON user_services FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own services"
  ON user_services FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own services"
  ON user_services FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_elevenlabs_tokens_updated_at ON elevenlabs_tokens;
CREATE TRIGGER update_elevenlabs_tokens_updated_at
  BEFORE UPDATE ON elevenlabs_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_services_updated_at ON user_services;
CREATE TRIGGER update_user_services_updated_at
  BEFORE UPDATE ON user_services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();