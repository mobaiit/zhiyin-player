-- Client keys Providers issued to Zhiyin, used to sign every MPP request to that Provider origin.
CREATE TABLE IF NOT EXISTS luri_music_provider_clients (
  id TEXT PRIMARY KEY,
  provider_origin TEXT NOT NULL UNIQUE,
  client_key TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  secret_hint TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
