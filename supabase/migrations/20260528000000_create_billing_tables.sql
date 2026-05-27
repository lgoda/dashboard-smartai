-- ─── Billing System ──────────────────────────────────────────────────────────
-- Tables: billing_admin_config, billing_agent_config, billing_client_config,
--         billing_packages, billing_ledger, billing_balance, retell_call_billing

-- ─── billing_admin_config ────────────────────────────────────────────────────

CREATE TABLE billing_admin_config (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  default_margin_percent   NUMERIC(5,2)  NOT NULL DEFAULT 30.00,
  usd_eur_rate             NUMERIC(8,6)  NOT NULL DEFAULT 0.930000,
  notification_email       TEXT,
  retell_billing_api_token TEXT,
  last_retell_sync_at      TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Single-row guard
CREATE UNIQUE INDEX billing_admin_config_singleton ON billing_admin_config ((TRUE));

-- Seed default row
INSERT INTO billing_admin_config (default_margin_percent, usd_eur_rate) VALUES (30.00, 0.930000);

-- RLS: only admins (checked in API layer via service role key)
ALTER TABLE billing_admin_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only" ON billing_admin_config
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── billing_agent_config ────────────────────────────────────────────────────

CREATE TABLE billing_agent_config (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id               TEXT        NOT NULL UNIQUE,
  user_id                UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agent_name             TEXT,
  price_per_minute_cents INT,        -- NULL = use margin% instead
  is_active              BOOLEAN     NOT NULL DEFAULT true,
  created_by             UUID        REFERENCES profiles(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX billing_agent_config_user_id ON billing_agent_config (user_id);
CREATE INDEX billing_agent_config_agent_id ON billing_agent_config (agent_id);

ALTER TABLE billing_agent_config ENABLE ROW LEVEL SECURITY;
-- Admins see all; users see only their own
CREATE POLICY "admin_or_owner" ON billing_agent_config
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR user_id = auth.uid()
  );

-- ─── billing_client_config ───────────────────────────────────────────────────

CREATE TABLE billing_client_config (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         UUID        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  billing_mode                    TEXT        NOT NULL DEFAULT 'prepaid'
                                    CHECK (billing_mode IN ('prepaid','postpaid','hybrid')),
  margin_percent                  NUMERIC(5,2),  -- NULL = use admin default
  low_balance_threshold_minutes   INT         NOT NULL DEFAULT 30,
  auto_recharge_enabled           BOOLEAN     NOT NULL DEFAULT false,
  auto_recharge_package_id        UUID,        -- FK set below after billing_packages exists
  stripe_customer_id              TEXT,
  stripe_payment_method_id        TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX billing_client_config_user_id ON billing_client_config (user_id);

ALTER TABLE billing_client_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_or_owner" ON billing_client_config
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR user_id = auth.uid()
  );

-- ─── billing_packages ────────────────────────────────────────────────────────

CREATE TABLE billing_packages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  minutes     INT         NOT NULL CHECK (minutes > 0),
  price_cents INT         NOT NULL CHECK (price_cents > 0),
  currency    TEXT        NOT NULL DEFAULT 'eur',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_by  UUID        REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE billing_packages ENABLE ROW LEVEL SECURITY;
-- All authenticated users can read; only admins can write
CREATE POLICY "read_authenticated" ON billing_packages
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "write_admin" ON billing_packages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Add deferred FK from billing_client_config
ALTER TABLE billing_client_config
  ADD CONSTRAINT fk_auto_recharge_package
  FOREIGN KEY (auto_recharge_package_id) REFERENCES billing_packages(id)
  ON DELETE SET NULL;

-- ─── billing_balance ─────────────────────────────────────────────────────────

CREATE TABLE billing_balance (
  user_id         UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance_minutes NUMERIC(10,4) NOT NULL DEFAULT 0,
  balance_cents   INT           NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE billing_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_or_owner" ON billing_balance
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR user_id = auth.uid()
  );

-- ─── billing_ledger ──────────────────────────────────────────────────────────

CREATE TABLE billing_ledger (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type                  TEXT        NOT NULL
                          CHECK (type IN ('purchase','call_debit','manual_credit','manual_debit','refund','auto_recharge')),
  amount_cents          INT         NOT NULL,   -- positive = credit, negative = debit
  minutes_delta         NUMERIC(10,4) NOT NULL, -- positive = credit, negative = debit
  balance_after_minutes NUMERIC(10,4) NOT NULL,
  reference_id          TEXT,                   -- call_id, stripe_invoice_id, or free text
  description           TEXT,
  idempotency_key       TEXT        NOT NULL UNIQUE,
  created_by            UUID        REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX billing_ledger_user_created ON billing_ledger (user_id, created_at DESC);
CREATE INDEX billing_ledger_reference ON billing_ledger (reference_id);

ALTER TABLE billing_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_or_owner" ON billing_ledger
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR user_id = auth.uid()
  );

-- ─── retell_call_billing ─────────────────────────────────────────────────────

CREATE TABLE retell_call_billing (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  call_id              TEXT        NOT NULL UNIQUE,
  agent_id             TEXT        NOT NULL,
  duration_seconds     NUMERIC(8,2),
  cost_retell_usd      NUMERIC(10,6),
  cost_client_eur      NUMERIC(10,2),
  cost_client_minutes  NUMERIC(10,4),
  margin_percent       NUMERIC(5,2),
  ledger_id            UUID        REFERENCES billing_ledger(id),
  billed_at            TIMESTAMPTZ,
  sync_status          TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (sync_status IN ('pending','billed','error','skipped')),
  error_detail         TEXT,
  retell_start_ts      TIMESTAMPTZ,
  retell_end_ts        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX retell_call_billing_user_id ON retell_call_billing (user_id, created_at DESC);
CREATE INDEX retell_call_billing_sync_status ON retell_call_billing (sync_status);
CREATE INDEX retell_call_billing_agent_id ON retell_call_billing (agent_id);

ALTER TABLE retell_call_billing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_or_owner" ON retell_call_billing
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR user_id = auth.uid()
  );

-- ─── credit_minutes() — transactional ledger write ───────────────────────────
-- Always call this function (never INSERT billing_ledger directly).
-- Returns the new ledger row. Idempotent: same idempotency_key → returns existing row.

CREATE OR REPLACE FUNCTION credit_minutes(
  p_user_id         UUID,
  p_minutes_delta   NUMERIC,
  p_amount_cents    INT,
  p_type            TEXT,
  p_reference_id    TEXT,
  p_idempotency_key TEXT,
  p_description     TEXT,
  p_created_by      UUID DEFAULT NULL
)
RETURNS billing_ledger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing  billing_ledger;
  v_balance   NUMERIC(10,4);
  v_new_bal   NUMERIC(10,4);
  v_ledger    billing_ledger;
BEGIN
  -- Idempotency: return existing row if key already used
  SELECT * INTO v_existing
  FROM billing_ledger
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Read current balance (0 if no row yet)
  SELECT COALESCE(balance_minutes, 0) INTO v_balance
  FROM billing_balance
  WHERE user_id = p_user_id;

  IF v_balance IS NULL THEN
    v_balance := 0;
  END IF;

  v_new_bal := v_balance + p_minutes_delta;

  -- Insert immutable ledger row
  INSERT INTO billing_ledger (
    user_id, type, amount_cents, minutes_delta,
    balance_after_minutes, reference_id, description,
    idempotency_key, created_by
  )
  VALUES (
    p_user_id, p_type, p_amount_cents, p_minutes_delta,
    v_new_bal, p_reference_id, p_description,
    p_idempotency_key, p_created_by
  )
  RETURNING * INTO v_ledger;

  -- Upsert balance cache
  INSERT INTO billing_balance (user_id, balance_minutes, balance_cents, last_updated_at)
  VALUES (p_user_id, v_new_bal, 0, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance_minutes  = v_new_bal,
        last_updated_at  = now();

  RETURN v_ledger;
END;
$$;
