/*
  # Create OpenAI Tokens Table

  Stores user-provided OpenAI API keys for the conversation intent analysis feature.
  Each user supplies their own key (uses their own OpenAI credits).
*/

CREATE TABLE IF NOT EXISTS openai_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_token text NOT NULL,
  is_active boolean DEFAULT true,
  last_verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS openai_tokens_user_id_idx ON openai_tokens(user_id);

ALTER TABLE openai_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own OpenAI token" ON openai_tokens;
DROP POLICY IF EXISTS "Users can insert own OpenAI token" ON openai_tokens;
DROP POLICY IF EXISTS "Users can update own OpenAI token" ON openai_tokens;
DROP POLICY IF EXISTS "Users can delete own OpenAI token" ON openai_tokens;

CREATE POLICY "Users can view own OpenAI token"
  ON openai_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own OpenAI token"
  ON openai_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own OpenAI token"
  ON openai_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own OpenAI token"
  ON openai_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_openai_tokens_updated_at ON openai_tokens;
CREATE TRIGGER update_openai_tokens_updated_at
  BEFORE UPDATE ON openai_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
