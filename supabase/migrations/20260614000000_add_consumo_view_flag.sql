-- ─── Consumo view flag ───────────────────────────────────────────────────────
-- Enables the read-only "Consumo" page (real AI cost per period, NO invoicing)
-- for selected clients. Independent from billing_mode: the page reads costs live
-- from Retell and applies the client's margin (set margin_percent = 0 to show the
-- raw real cost). Default false → page is hidden unless explicitly enabled per user.

ALTER TABLE user_services
  ADD COLUMN IF NOT EXISTS has_consumo boolean NOT NULL DEFAULT false;
