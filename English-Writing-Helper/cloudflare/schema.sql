CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  anonymous_user_id TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL,
  source_char_count INTEGER NOT NULL DEFAULT 0,
  output_char_count INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'unknown',
  style TEXT NOT NULL,
  source TEXT NOT NULL,
  extension_version TEXT NOT NULL,
  date_bucket TEXT NOT NULL,
  user_agent_hash TEXT,
  is_test INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_usage_events_date ON usage_events(date_bucket);
CREATE INDEX IF NOT EXISTS idx_usage_events_version ON usage_events(extension_version);
CREATE INDEX IF NOT EXISTS idx_usage_events_anonymous_user ON usage_events(anonymous_user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_is_test ON usage_events(is_test);

CREATE TABLE IF NOT EXISTS daily_usage_summary (
  date_bucket TEXT PRIMARY KEY,
  total_events INTEGER NOT NULL DEFAULT 0,
  successful_translations INTEGER NOT NULL DEFAULT 0,
  failed_translations INTEGER NOT NULL DEFAULT 0,
  source_char_count INTEGER NOT NULL DEFAULT 0,
  output_char_count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
