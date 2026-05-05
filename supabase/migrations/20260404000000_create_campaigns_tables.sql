/*
  # Campaign List Manager Tables

  Campaigns are managed in the dashboard only (Supabase).
  GHL receives contacts that are already filtered and queued.

  Tables:
  - campaigns          — campaign containers with schedule settings
  - campaign_imports   — one record per CSV/Excel upload
  - campaign_contacts  — individual contacts in queue
  - campaign_logs      — full audit trail
*/

-- ── campaigns ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('whatsapp','email','sms','phone','other')),
  status text DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  default_automation_id text,
  default_automation_name text,
  campaign_tag text,
  notes text,
  -- Schedule settings (used by send route)
  send_days text[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'],
  send_time_from time DEFAULT '09:00',
  send_time_to time DEFAULT '18:00',
  daily_limit integer DEFAULT 100,
  timezone text DEFAULT 'Europe/Rome',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── campaign_imports ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  crm_automation_id text NOT NULL,
  crm_automation_name text NOT NULL,
  list_tag text NOT NULL,
  excluded_tags text[] DEFAULT '{}',
  existing_contact_policy text DEFAULT 'tag_only'
    CHECK (existing_contact_policy IN ('update','tag_only','exclude')),
  consent_accepted boolean DEFAULT false,
  consent_text text,
  consent_accepted_at timestamptz,
  file_name text,
  total_rows integer DEFAULT 0,
  valid_contacts integer DEFAULT 0,
  excluded_no_phone integer DEFAULT 0,
  excluded_duplicates integer DEFAULT 0,
  queued_contacts integer DEFAULT 0,
  status text DEFAULT 'queued'
    CHECK (status IN ('queued','sending','completed','error')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── campaign_contacts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES campaign_imports(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  phone_normalized text,
  email text,
  company text,
  raw_data jsonb DEFAULT '{}',
  list_tag text,
  crm_automation_id text,
  crm_contact_id text,
  status text DEFAULT 'queued'
    CHECK (status IN ('queued','excluded','sent_to_crm','error','completed')),
  exclusion_reason text,
  error_detail text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── campaign_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid,
  import_id uuid,
  action text NOT NULL,
  detail text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS campaigns_user_id_idx ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS campaign_imports_campaign_id_idx ON campaign_imports(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_contacts_import_status_idx ON campaign_contacts(import_id, status);
CREATE INDEX IF NOT EXISTS campaign_contacts_campaign_sent_idx ON campaign_contacts(campaign_id, sent_at);
CREATE INDEX IF NOT EXISTS campaign_logs_import_id_idx ON campaign_logs(import_id);
CREATE INDEX IF NOT EXISTS campaign_logs_campaign_id_idx ON campaign_logs(campaign_id);

-- ── Triggers for updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_imports_updated_at ON campaign_imports;
CREATE TRIGGER update_campaign_imports_updated_at
  BEFORE UPDATE ON campaign_imports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_contacts_updated_at ON campaign_contacts;
CREATE TRIGGER update_campaign_contacts_updated_at
  BEFORE UPDATE ON campaign_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_logs ENABLE ROW LEVEL SECURITY;

-- campaigns
DROP POLICY IF EXISTS "Users can view own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can insert own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can update own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can delete own campaigns" ON campaigns;
CREATE POLICY "Users can view own campaigns" ON campaigns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own campaigns" ON campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own campaigns" ON campaigns FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own campaigns" ON campaigns FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- campaign_imports
DROP POLICY IF EXISTS "Users can view own imports" ON campaign_imports;
DROP POLICY IF EXISTS "Users can insert own imports" ON campaign_imports;
DROP POLICY IF EXISTS "Users can update own imports" ON campaign_imports;
CREATE POLICY "Users can view own imports" ON campaign_imports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own imports" ON campaign_imports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own imports" ON campaign_imports FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- campaign_contacts
DROP POLICY IF EXISTS "Users can view own contacts" ON campaign_contacts;
DROP POLICY IF EXISTS "Users can insert own contacts" ON campaign_contacts;
DROP POLICY IF EXISTS "Users can update own contacts" ON campaign_contacts;
CREATE POLICY "Users can view own contacts" ON campaign_contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contacts" ON campaign_contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contacts" ON campaign_contacts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- campaign_logs
DROP POLICY IF EXISTS "Users can view own logs" ON campaign_logs;
DROP POLICY IF EXISTS "Users can insert own logs" ON campaign_logs;
CREATE POLICY "Users can view own logs" ON campaign_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own logs" ON campaign_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
