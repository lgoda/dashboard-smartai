/*
  # Drop ElevenLabs Sync Tables

  ## Overview
  This migration removes the local caching tables for ElevenLabs conversations.
  The application now queries the ElevenLabs API directly instead of syncing data to local storage.

  ## Changes
  
  ### Dropped Tables
  1. `elevenlabs_conversations` - Local cache of ElevenLabs conversations
  2. `elevenlabs_sync_status` - Sync status tracking table
  
  ## Rationale
  - Eliminates data duplication
  - Reduces storage costs
  - Ensures data is always up-to-date from source
  - Simplifies application architecture
  - Removes sync complexity and potential sync errors
*/

-- Drop tables if they exist
DROP TABLE IF EXISTS elevenlabs_conversations CASCADE;
DROP TABLE IF EXISTS elevenlabs_sync_status CASCADE;
