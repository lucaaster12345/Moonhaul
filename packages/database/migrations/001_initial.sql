CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS world_state (id INTEGER PRIMARY KEY CHECK(id = 1), state_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS game_config (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  total_actions INTEGER NOT NULL DEFAULT 0, total_contribution REAL NOT NULL DEFAULT 0, xp REAL NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1, department TEXT NOT NULL DEFAULT 'winch', stamina REAL NOT NULL DEFAULT 100,
  stamina_updated_at TEXT NOT NULL, currency REAL NOT NULL DEFAULT 0, injuries_json TEXT NOT NULL DEFAULT '[]',
  commendations_json TEXT NOT NULL DEFAULT '[]', titles_json TEXT NOT NULL DEFAULT '["Trainee"]', active_title TEXT NOT NULL DEFAULT 'Trainee',
  inventory_json TEXT NOT NULL DEFAULT '{}', statistics_json TEXT NOT NULL DEFAULT '{}', moon_distance REAL NOT NULL DEFAULT 0,
  disasters_survived INTEGER NOT NULL DEFAULT 0, shifts_participated INTEGER NOT NULL DEFAULT 0, last_action_at TEXT,
  disabled_until TEXT
);
CREATE TABLE IF NOT EXISTS contributions (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, command TEXT NOT NULL, amount REAL NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS event_history (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, event_name TEXT NOT NULL, outcome TEXT NOT NULL, details_json TEXT NOT NULL, severity TEXT NOT NULL, occurred_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS world_scars (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, modifiers_json TEXT NOT NULL, acquired_at TEXT NOT NULL, source_event TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS event_settings (event_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, weight REAL NOT NULL, cooldown_seconds INTEGER NOT NULL, last_triggered_at TEXT);
CREATE TABLE IF NOT EXISTS processed_chat_messages (id TEXT PRIMARY KEY, processed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, old_value_json TEXT, new_value_json TEXT, ip TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL UNIQUE, reason TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_players_contribution ON players(total_contribution DESC);
CREATE INDEX IF NOT EXISTS idx_players_xp ON players(xp DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_player_time ON contributions(player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_event_history_time ON event_history(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_processed_messages_time ON processed_chat_messages(processed_at);
