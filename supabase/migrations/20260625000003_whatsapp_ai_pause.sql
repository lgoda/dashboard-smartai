-- ─── WhatsApp: pausa IA (takeover operatore) ─────────────────────────────────
-- Flag per mettere in pausa l'agente IA su una singola istanza/numero: quando true,
-- il webhook OpenWA viene disabilitato (i messaggi non vengono inoltrati a n8n) così
-- l'operatore può rispondere a mano dall'app WhatsApp senza che l'IA intervenga.

ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS ai_paused boolean NOT NULL DEFAULT false;
