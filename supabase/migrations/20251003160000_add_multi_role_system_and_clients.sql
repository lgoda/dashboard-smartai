/*
  # Add Multi-Role System with Clients Management

  ## Overview
  This migration transforms the single-tenant dashboard into a multi-tenant system with role-based access control.
  It introduces clients as separate entities and allows users to be either regular users (tied to one client) or admins (can manage all clients).

  ## New Tables

  ### `clients`
  Represents client entities (companies/organizations using the chatbot service).
  - `id` (uuid, primary key) - Unique identifier for each client
  - `name` (text) - Client display name
  - `email` (text) - Client contact email
  - `company_name` (text) - Client company/organization name
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `user_profiles`
  Extends auth.users with role and client association.
  - `id` (uuid, primary key, FK to auth.users) - References the authenticated user
  - `role` (text) - User role: 'user' or 'admin'
  - `client_id` (uuid, FK to clients, nullable) - Associated client for 'user' role (null for 'admin')
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `client_configurations`
  Stores technical configuration parameters for each client.
  - `id` (uuid, primary key) - Unique identifier
  - `client_id` (uuid, FK unique to clients) - Associated client (one-to-one relationship)
  - `location_id` (text) - Location identifier
  - `calendar_id` (text) - Calendar identifier
  - `credential_id` (text) - Credential identifier
  - `eleven_lab_key` (text) - ElevenLabs API key
  - `agent_key` (text) - Agent key
  - `phone_number_key` (text) - Phone number key
  - `timezone` (text) - Client timezone
  - `appointment_title` (text) - Default appointment title
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `client_prompts`
  Stores AI prompts configuration for each client.
  - `id` (uuid, primary key) - Unique identifier
  - `client_id` (uuid, FK unique to clients) - Associated client (one-to-one relationship)
  - `llm_prompt` (text) - Generic LLM prompt (supports Markdown)
  - `pipeline_classification_prompt` (text) - Pipeline classification prompt for conversation state
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Modified Tables

  ### `leads`
  - Added `client_id` (uuid, FK nullable to clients) - Associates lead with a client

  ### `conversations`
  - Added `client_id` (uuid, FK nullable to clients) - Associates conversation with a client

  ## Security

  ### Row Level Security (RLS)
  All tables have RLS enabled with policies that implement:
  - Users with role 'user' can only access data for their assigned client
  - Users with role 'admin' can access data for all clients
  - User profiles are readable by the owner, manageable by admins

  ### Helper Function
  - `get_user_role()` - Returns the role of the current authenticated user

  ## Indexes
  - Indexes on client_id in leads and conversations for performance
  - Indexes on role and client_id in user_profiles
  - Unique indexes on client_id in client_configurations and client_prompts

  ## Important Notes
  - Existing data in leads and conversations will have client_id = NULL initially
  - Admin users must be created manually by updating user_profiles
  - First admin can be created with: UPDATE user_profiles SET role = 'admin', client_id = NULL WHERE id = 'user-uuid';
  - Client configurations and prompts are optional and created on-demand
*/

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company_name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT user_role_client_check CHECK (
    (role = 'admin' AND client_id IS NULL) OR
    (role = 'user')
  )
);

-- Create client_configurations table
CREATE TABLE IF NOT EXISTS client_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  location_id text DEFAULT '',
  calendar_id text DEFAULT '',
  credential_id text DEFAULT '',
  eleven_lab_key text DEFAULT '',
  agent_key text DEFAULT '',
  phone_number_key text DEFAULT '',
  timezone text DEFAULT 'UTC',
  appointment_title text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create client_prompts table
CREATE TABLE IF NOT EXISTS client_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  llm_prompt text DEFAULT '',
  pipeline_classification_prompt text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add client_id to existing leads table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add client_id to existing conversations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE conversations ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_client_id ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_client_id ON user_profiles(client_id);

-- Create helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(role, 'user') FROM user_profiles WHERE id = auth.uid();
$$;

-- Create helper function to get user client_id
CREATE OR REPLACE FUNCTION get_user_client_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT client_id FROM user_profiles WHERE id = auth.uid();
$$;

-- Enable RLS on new tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clients table
CREATE POLICY "Users can view their own client"
  ON clients FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'admin' OR
    id = get_user_client_id()
  );

CREATE POLICY "Admins can create clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (get_user_role() = 'admin');

-- RLS Policies for user_profiles table
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = 'user');

CREATE POLICY "Admins can manage all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- RLS Policies for client_configurations table
CREATE POLICY "Users can view own client configuration"
  ON client_configurations FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'admin' OR
    client_id = get_user_client_id()
  );

CREATE POLICY "Admins can manage configurations"
  ON client_configurations FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can update configurations"
  ON client_configurations FOR UPDATE
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can delete configurations"
  ON client_configurations FOR DELETE
  TO authenticated
  USING (get_user_role() = 'admin');

-- RLS Policies for client_prompts table
CREATE POLICY "Users can view own client prompts"
  ON client_prompts FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'admin' OR
    client_id = get_user_client_id()
  );

CREATE POLICY "Admins can manage prompts"
  ON client_prompts FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can update prompts"
  ON client_prompts FOR UPDATE
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can delete prompts"
  ON client_prompts FOR DELETE
  TO authenticated
  USING (get_user_role() = 'admin');

-- Update RLS Policies for leads table
DROP POLICY IF EXISTS "Users can view own leads" ON leads;
DROP POLICY IF EXISTS "Users can create own leads" ON leads;
DROP POLICY IF EXISTS "Users can update own leads" ON leads;
DROP POLICY IF EXISTS "Users can delete own leads" ON leads;

CREATE POLICY "Users can view leads based on role"
  ON leads FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'admin' OR
    (get_user_role() = 'user' AND client_id = get_user_client_id())
  );

CREATE POLICY "Users can create leads based on role"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() = 'admin' OR
    (get_user_role() = 'user' AND client_id = get_user_client_id())
  );

CREATE POLICY "Users can update leads based on role"
  ON leads FOR UPDATE
  TO authenticated
  USING (
    get_user_role() = 'admin' OR
    (get_user_role() = 'user' AND client_id = get_user_client_id())
  )
  WITH CHECK (
    get_user_role() = 'admin' OR
    (get_user_role() = 'user' AND client_id = get_user_client_id())
  );

CREATE POLICY "Users can delete leads based on role"
  ON leads FOR DELETE
  TO authenticated
  USING (
    get_user_role() = 'admin' OR
    (get_user_role() = 'user' AND client_id = get_user_client_id())
  );

-- Update RLS Policies for conversations table
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON conversations;

CREATE POLICY "Users can view conversations based on role"
  ON conversations FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'admin' OR
    (get_user_role() = 'user' AND client_id = get_user_client_id())
  );

CREATE POLICY "Users can create conversations based on role"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    get_user_role() = 'admin' OR
    (get_user_role() = 'user' AND client_id = get_user_client_id())
  );

CREATE POLICY "Users can update conversations based on role"
  ON conversations FOR UPDATE
  TO authenticated
  USING (
    get_user_role() = 'admin' OR
    (get_user_role() = 'user' AND client_id = get_user_client_id())
  )
  WITH CHECK (
    get_user_role() = 'admin' OR
    (get_user_role() = 'user' AND client_id = get_user_client_id())
  );

CREATE POLICY "Users can delete conversations based on role"
  ON conversations FOR DELETE
  TO authenticated
  USING (
    get_user_role() = 'admin' OR
    (get_user_role() = 'user' AND client_id = get_user_client_id())
  );

-- Create trigger to auto-create user_profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_profiles (id, role, client_id)
  VALUES (NEW.id, 'user', NULL)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_configurations_updated_at ON client_configurations;
CREATE TRIGGER update_client_configurations_updated_at
  BEFORE UPDATE ON client_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_prompts_updated_at ON client_prompts;
CREATE TRIGGER update_client_prompts_updated_at
  BEFORE UPDATE ON client_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
