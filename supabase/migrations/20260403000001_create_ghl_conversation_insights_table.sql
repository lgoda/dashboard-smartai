/*
  # Create GHL Conversation Insights Table

  Stores AI-generated intent analysis for GoHighLevel conversations.
  Used to identify "hot leads" — contacts with high intent who haven't converted.
*/

CREATE TABLE IF NOT EXISTS ghl_conversation_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  location_id text NOT NULL,
  intent_score integer DEFAULT 0 CHECK (intent_score >= 0 AND intent_score <= 100),
  is_converted boolean DEFAULT false,
  is_hot_lead boolean DEFAULT false,       -- intent_score >= 70 AND NOT is_converted
  intent_signals text[] DEFAULT '{}',
  conversion_signals text[] DEFAULT '{}',
  missing_action text,
  suggested_followup text,
  analyzed_at timestamptz DEFAULT now(),
  message_count integer DEFAULT 0          -- snapshot at analysis time (staleness check)
);

-- One insight record per (user, conversation)
CREATE UNIQUE INDEX IF NOT EXISTS ghl_conversation_insights_user_conv_idx
  ON ghl_conversation_insights(user_id, conversation_id);

-- Fast lookup of hot leads per user
CREATE INDEX IF NOT EXISTS ghl_conversation_insights_hot_lead_idx
  ON ghl_conversation_insights(user_id, is_hot_lead);

ALTER TABLE ghl_conversation_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own insights" ON ghl_conversation_insights;
DROP POLICY IF EXISTS "Users can insert own insights" ON ghl_conversation_insights;
DROP POLICY IF EXISTS "Users can update own insights" ON ghl_conversation_insights;
DROP POLICY IF EXISTS "Users can delete own insights" ON ghl_conversation_insights;

CREATE POLICY "Users can view own insights"
  ON ghl_conversation_insights FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insights"
  ON ghl_conversation_insights FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own insights"
  ON ghl_conversation_insights FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own insights"
  ON ghl_conversation_insights FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
