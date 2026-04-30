CREATE TABLE IF NOT EXISTS managed_accounts (
  license_key TEXT PRIMARY KEY,
  anonymous_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  analytics_bonus_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_key TEXT NOT NULL,
  order_id TEXT,
  delta_characters INTEGER NOT NULL,
  reason TEXT NOT NULL,
  analytics_bonus_applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (license_key) REFERENCES managed_accounts(license_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_order ON credit_ledger(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_ledger_license ON credit_ledger(license_key);

CREATE TABLE IF NOT EXISTS managed_translation_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  license_key TEXT NOT NULL,
  anonymous_user_id TEXT,
  status TEXT NOT NULL,
  source_char_count INTEGER NOT NULL DEFAULT 0,
  output_char_count INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  extension_version TEXT NOT NULL,
  date_bucket TEXT NOT NULL,
  is_test INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (license_key) REFERENCES managed_accounts(license_key)
);

CREATE INDEX IF NOT EXISTS idx_managed_usage_license ON managed_translation_usage(license_key);
CREATE INDEX IF NOT EXISTS idx_managed_usage_date ON managed_translation_usage(date_bucket);
CREATE INDEX IF NOT EXISTS idx_managed_usage_is_test ON managed_translation_usage(is_test);
