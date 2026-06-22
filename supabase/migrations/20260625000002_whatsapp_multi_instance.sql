-- ─── WhatsApp multi-istanza ──────────────────────────────────────────────────
-- Consente più numeri WhatsApp (istanze OpenWA) per utente: si rimuove il vincolo
-- UNIQUE su user_id e si aggiunge una label per distinguere le istanze (es. EOK/Ares).
-- Le policy RLS restano invariate (auth.uid() = user_id), già compatibili con più righe.

-- Da indice UNIQUE a indice non-unique su user_id
DROP INDEX IF EXISTS whatsapp_instances_user_id_idx;
CREATE INDEX IF NOT EXISTS whatsapp_instances_user_id_idx ON whatsapp_instances(user_id);

-- Etichetta libera per identificare l'istanza (es. "EOK", "Ares")
ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS label text;
