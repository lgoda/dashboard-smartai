-- Add contact_name and address columns to campaign_contacts
ALTER TABLE campaign_contacts
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS address text;
