/*
  # Create leads and conversations tables

  ## Overview
  This migration sets up the database schema for a chatbot dashboard application that tracks leads and conversations.

  ## New Tables
  
  ### `leads`
  Stores lead information collected from chatbot interactions.
  - `id` (uuid, primary key) - Unique identifier for each lead
  - `user_id` (uuid, foreign key) - References the authenticated user who owns this lead
  - `name` (text) - Lead's full name
  - `email` (text) - Lead's email address
  - `phone` (text) - Lead's phone number (optional)
  - `message` (text) - Message or inquiry from the lead (optional)
  - `source` (text) - Source/origin of the lead (e.g., website, landing page)
  - `created_at` (timestamptz) - Timestamp when the lead was created

  ### `conversations`
  Stores all messages from chatbot conversations.
  - `id` (uuid, primary key) - Unique identifier for each message
  - `user_id` (uuid, foreign key) - References the authenticated user who owns this conversation
  - `session_id` (text) - Groups messages by conversation session
  - `sender` (text) - Identifies message sender ('user' or 'bot')
  - `message` (text) - The actual message content
  - `created_at` (timestamptz) - Timestamp when the message was sent

  ## Security
  
  ### Row Level Security (RLS)
  - Both tables have RLS enabled to ensure data isolation between users
  - Users can only access their own leads and conversations
  
  ### RLS Policies
  
  #### leads table policies:
  1. SELECT: Users can view only their own leads
  2. INSERT: Users can create leads associated with their account
  3. UPDATE: Users can update only their own leads
  4. DELETE: Users can delete only their own leads

  #### conversations table policies:
  1. SELECT: Users can view only their own conversations
  2. INSERT: Users can create conversations associated with their account
  3. UPDATE: Users can update only their own conversations
  4. DELETE: Users can delete only their own conversations

  ## Indexes
  - Index on `user_id` for both tables to optimize queries by user
  - Index on `session_id` for conversations table to optimize session-based queries
  - Index on `created_at` for both tables to optimize date-based sorting

  ## Important Notes
  - All policies use `auth.uid()` to ensure proper user authentication
  - Default values are set for timestamps to auto-populate creation times
  - Phone and message fields in leads table allow NULL for flexibility
*/

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text DEFAULT '',
  message text DEFAULT '',
  source text NOT NULL DEFAULT 'unknown',
  created_at timestamptz DEFAULT now()
);

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  sender text NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security on both tables
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leads table
CREATE POLICY "Users can view own leads"
  ON leads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own leads"
  ON leads FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for conversations table
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);