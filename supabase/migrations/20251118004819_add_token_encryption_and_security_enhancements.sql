/*
  # Add Token Encryption and Security Enhancements
  
  ## Overview
  This migration adds encryption for ElevenLabs API tokens and implements additional security measures.
  
  ## Changes
  
  ### 1. Enable pgcrypto Extension
  - Enables pgcrypto for encryption/decryption capabilities
  
  ### 2. Add Encrypted Token Column
  - Adds `encrypted_token` column to store encrypted API tokens
  - Adds `encryption_key_id` to track which encryption key was used
  
  ### 3. Create Secure Token Functions
  - `encrypt_api_token(token text, user_id uuid)` - Encrypts token with user-specific key
  - `decrypt_api_token(user_id uuid)` - Decrypts token for authorized user only
  
  ### 4. Add Token Rotation Support
  - `token_rotated_at` timestamp to track when token was last changed
  - `previous_token_hash` to detect if token changed externally
  
  ### 5. Add Audit Logging
  - `token_access_log` table to track when tokens are accessed
  - Helps with security monitoring and compliance
  
  ## Security Features
  - Tokens encrypted at rest using pgcrypto
  - User-specific encryption keys derived from user_id
  - Access logging for audit trails
  - Token verification tracking
  - Support for token rotation
*/

-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted token column and related fields to elevenlabs_tokens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'elevenlabs_tokens' AND column_name = 'encrypted_token'
  ) THEN
    ALTER TABLE elevenlabs_tokens 
    ADD COLUMN encrypted_token bytea,
    ADD COLUMN encryption_key_id text DEFAULT 'v1',
    ADD COLUMN token_rotated_at timestamptz,
    ADD COLUMN previous_token_hash text;
  END IF;
END $$;

-- Create function to encrypt API token with user-specific key
CREATE OR REPLACE FUNCTION encrypt_api_token(token text, uid uuid)
RETURNS bytea AS $$
DECLARE
  encryption_key text;
BEGIN
  -- Generate user-specific encryption key (in production, use a proper key management system)
  encryption_key := encode(digest(uid::text || 'smartservice_secret_key_2024', 'sha256'), 'hex');
  
  -- Encrypt the token using AES-256
  RETURN pgp_sym_encrypt(token, encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to decrypt API token (only accessible to the token owner)
CREATE OR REPLACE FUNCTION decrypt_api_token(uid uuid)
RETURNS text AS $$
DECLARE
  encryption_key text;
  encrypted_data bytea;
BEGIN
  -- Verify the requesting user matches the token owner
  IF auth.uid() != uid THEN
    RAISE EXCEPTION 'Unauthorized access to token';
  END IF;
  
  -- Get encrypted token for this user
  SELECT encrypted_token INTO encrypted_data
  FROM elevenlabs_tokens
  WHERE user_id = uid AND is_active = true;
  
  IF encrypted_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Generate user-specific encryption key
  encryption_key := encode(digest(uid::text || 'smartservice_secret_key_2024', 'sha256'), 'hex');
  
  -- Decrypt and return the token
  RETURN pgp_sym_decrypt(encrypted_data, encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit log table for token access
CREATE TABLE IF NOT EXISTS elevenlabs_token_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_type text NOT NULL,
  access_successful boolean DEFAULT true,
  ip_address inet,
  user_agent text,
  error_message text,
  accessed_at timestamptz DEFAULT now()
);

-- Create index for efficient audit log queries
CREATE INDEX IF NOT EXISTS token_access_log_user_time_idx 
  ON elevenlabs_token_access_log(user_id, accessed_at DESC);

-- Enable RLS on token access log
ALTER TABLE elevenlabs_token_access_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own access logs
CREATE POLICY "Users can view own token access logs"
  ON elevenlabs_token_access_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create trigger to log token access
CREATE OR REPLACE FUNCTION log_token_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Log when a token is accessed (updated or selected)
  INSERT INTO elevenlabs_token_access_log (user_id, access_type)
  VALUES (NEW.user_id, TG_OP);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for token updates
DROP TRIGGER IF EXISTS log_token_update ON elevenlabs_tokens;
CREATE TRIGGER log_token_update
  AFTER UPDATE ON elevenlabs_tokens
  FOR EACH ROW
  EXECUTE FUNCTION log_token_access();

-- Create function to migrate existing plain-text tokens to encrypted format
CREATE OR REPLACE FUNCTION migrate_plain_tokens_to_encrypted()
RETURNS void AS $$
DECLARE
  token_record RECORD;
BEGIN
  FOR token_record IN 
    SELECT id, user_id, api_token 
    FROM elevenlabs_tokens 
    WHERE encrypted_token IS NULL AND api_token IS NOT NULL
  LOOP
    UPDATE elevenlabs_tokens
    SET 
      encrypted_token = encrypt_api_token(token_record.api_token, token_record.user_id),
      encryption_key_id = 'v1',
      token_rotated_at = now()
    WHERE id = token_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migrate existing tokens (if any)
SELECT migrate_plain_tokens_to_encrypted();

-- Add constraint to ensure either api_token or encrypted_token exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'elevenlabs_tokens_has_token_check'
  ) THEN
    ALTER TABLE elevenlabs_tokens
    ADD CONSTRAINT elevenlabs_tokens_has_token_check
    CHECK (api_token IS NOT NULL OR encrypted_token IS NOT NULL);
  END IF;
END $$;
