-- ─── WhatsApp feature flag ───────────────────────────────────────────────────
-- Enables the WhatsApp (OpenWA) integration page for selected clients: connect a
-- personal WhatsApp via QR code and associate it to an n8n agent (inbound webhook).
-- Default false → the WhatsApp nav link and page are hidden unless enabled per user.

ALTER TABLE user_services
  ADD COLUMN IF NOT EXISTS has_whatsapp boolean NOT NULL DEFAULT false;
