export type UserRole = 'user' | 'admin'

export type Client = {
  id: string
  name: string
  email: string
  company_name: string
  created_at: string
  updated_at: string
}

export type UserProfile = {
  id: string
  role: UserRole
  client_id: string | null
  created_at: string
  updated_at: string
}

export type ClientConfiguration = {
  id: string
  client_id: string
  location_id: string
  calendar_id: string
  credential_id: string
  eleven_lab_key: string
  agent_key: string
  phone_number_key: string
  timezone: string
  appointment_title: string
  created_at: string
  updated_at: string
}

export type ClientPrompts = {
  id: string
  client_id: string
  llm_prompt: string
  pipeline_classification_prompt: string
  created_at: string
  updated_at: string
}

export type Lead = {
  id: string
  user_id: string
  client_id: string | null
  name: string
  email: string
  phone: string
  message: string
  source: string
  created_at: string
}

export type Conversation = {
  id: string
  user_id: string
  client_id: string | null
  session_id: string
  sender: string
  message: string
  created_at: string
}
