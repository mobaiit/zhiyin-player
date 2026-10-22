ALTER TABLE luri_music_users ADD COLUMN disabled_at TEXT;
ALTER TABLE luri_music_users ADD COLUMN last_login_at TEXT;
UPDATE luri_music_users SET last_login_at = COALESCE(updated_at, created_at) WHERE last_login_at IS NULL;

CREATE TABLE IF NOT EXISTS luri_music_admin_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE luri_music_admin_sessions ADD COLUMN admin_account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_luri_music_users_last_login_at ON luri_music_users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_luri_music_admin_sessions_account ON luri_music_admin_sessions(admin_account_id);
