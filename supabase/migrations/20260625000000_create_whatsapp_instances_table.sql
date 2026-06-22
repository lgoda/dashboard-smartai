/*
  # Create WhatsApp (OpenWA) Instances Table

  ## Overview
  Stores, per user, the OpenWA WhatsApp session linked via QR code plus the
  associated n8n agent (inbound webhook). One personal WhatsApp instance per user.

  ## New Tables

  ### `whatsapp_instances`
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK → auth.users, unique)
  - `session_id` (text) — OpenWA session id
  - `session_name` (text) — OpenWA session name (smartai-<user.id slice 8>)
  - `phone` (text) — connected WhatsApp number
  - `push_name` (text) — WhatsApp display name
  - `profile_image_url` (text) — WhatsApp profile picture URL
  - `status` (text) — not_connected | waiting_qr | connected | disconnected | error
  - `remote_status` (text) — raw OpenWA session status
  - `n8n_webhook_url` (text) — n8n agent production webhook URL
  - `n8n_agent_name` (text) — optional friendly name for the agent
  - `n8n_webhook_id` (text) — id of the webhook registered on OpenWA
  - `last_error` (text)
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

-- Create whatsapp_instances table
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  session_name text,
  phone text,
  push_name text,
  profile_image_url text,
  status text NOT NULL DEFAULT 'not_connected',
  remote_status text,
  n8n_webhook_url text,
  n8n_agent_name text,
  n8n_webhook_id text,
  last_error text,
  last_verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One WhatsApp instance per user
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instances_user_id_idx ON whatsapp_instances(user_id);

-- Enable RLS
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for idempotency
DROP POLICY IF EXISTS "Users can view own WhatsApp instance" ON whatsapp_instances;
DROP POLICY IF EXISTS "Users can insert own WhatsApp instance" ON whatsapp_instances;
DROP POLICY IF EXISTS "Users can update own WhatsApp instance" ON whatsapp_instances;
DROP POLICY IF EXISTS "Users can delete own WhatsApp instance" ON whatsapp_instances;

-- RLS Policies
CREATE POLICY "Users can view own WhatsApp instance"
  ON whatsapp_instances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own WhatsApp instance"
  ON whatsapp_instances FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own WhatsApp instance"
  ON whatsapp_instances FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own WhatsApp instance"
  ON whatsapp_instances FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_whatsapp_instances_updated_at ON whatsapp_instances;
CREATE TRIGGER update_whatsapp_instances_updated_at
  BEFORE UPDATE ON whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
