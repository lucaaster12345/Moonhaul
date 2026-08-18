import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Player, WorldScar, WorldState } from "../shared/types.js";
import { CONFIG_DEFINITIONS, defaultConfig, freshWorld, type GameConfig } from "../game-engine/config.js";
import { EVENTS } from "../game-engine/events.js";
import type { EngineHistoryEntry } from "../game-engine/engine.js";

type SqlValue = string | number | bigint | null;

export interface WorkerQuery {
  sort?: "contribution" | "xp" | "moonDistance" | "shifts" | "disasters";
  search?: string;
  limit?: number;
}

export class MoonhaulDatabase {
  readonly db: DatabaseSync;
  readonly path: string;

  constructor(path: string) {
    this.path = resolve(path);
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.migrate();
    this.initialize();
  }

  close(): void {
    this.db.exec("PRAGMA optimize");
    this.db.close();
  }

  migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    const applied = this.db.prepare("SELECT 1 FROM migrations WHERE id = 1").get();
    if (!applied) {
      const sql = readFileSync(new URL("./migrations/001_initial.sql", import.meta.url), "utf8");
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(sql);
        this.db.prepare("INSERT INTO migrations(id, name, applied_at) VALUES(1, ?, ?)").run("001_initial", new Date().toISOString());
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  initialize(now = new Date()): void {
    this.transaction(() => {
      const world = this.db.prepare("SELECT id FROM world_state WHERE id = 1").get();
      if (!world) this.db.prepare("INSERT INTO world_state(id, state_json, updated_at) VALUES(1, ?, ?)").run(JSON.stringify(freshWorld(now)), now.toISOString());
      const insertConfig = this.db.prepare("INSERT OR IGNORE INTO game_config(key, value_json, updated_at) VALUES(?, ?, ?)");
      for (const item of CONFIG_DEFINITIONS) insertConfig.run(item.key, JSON.stringify(item.defaultValue), now.toISOString());
      const insertEvent = this.db.prepare("INSERT OR IGNORE INTO event_settings(event_id, enabled, weight, cooldown_seconds) VALUES(?, 1, ?, ?)");
      for (const event of EVENTS) insertEvent.run(event.id, event.weight, event.cooldownSeconds);
    });
  }

  loadWorld(): WorldState {
    const row = this.db.prepare("SELECT state_json FROM world_state WHERE id = 1").get() as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) as WorldState : freshWorld();
  }

  saveWorld(state: WorldState): void {
    this.db.prepare("UPDATE world_state SET state_json = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(state), new Date().toISOString());
  }

  loadConfig(): GameConfig {
    const config = defaultConfig();
    const rows = this.db.prepare("SELECT key, value_json FROM game_config").all() as Array<{ key: string; value_json: string }>;
    for (const row of rows) config[row.key] = JSON.parse(row.value_json) as number | boolean | string;
    return config;
  }

  configRows(): Array<{ key: string; value: unknown; definition: (typeof CONFIG_DEFINITIONS)[number] }> {
    const config = this.loadConfig();
    return CONFIG_DEFINITIONS.map((definition) => ({ key: definition.key, value: config[definition.key], definition }));
  }

  setConfig(key: string, value: number | boolean | string): void {
    const definition = CONFIG_DEFINITIONS.find((item) => item.key === key);
    if (!definition) throw new Error("Unknown configuration key");
    if (definition.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected a finite number");
      if (definition.min !== undefined && value < definition.min) throw new Error(`Minimum value is ${definition.min}`);
      if (definition.max !== undefined && value > definition.max) throw new Error(`Maximum value is ${definition.max}`);
    } else if (typeof value !== definition.type) throw new Error(`Expected ${definition.type}`);
    this.db.prepare("INSERT INTO game_config(key, value_json, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at").run(key, JSON.stringify(value), new Date().toISOString());
  }

  resetConfig(key?: string, category?: string): void {
    const selected = CONFIG_DEFINITIONS.filter((item) => (!key || item.key === key) && (!category || item.category === category));
    this.transaction(() => selected.forEach((item) => this.setConfig(item.key, item.defaultValue)));
  }

  getOrCreatePlayer(id: string, displayName: string, now = new Date()): Player {
    let player = this.getPlayer(id);
    if (!player) {
      const at = now.toISOString();
      this.db.prepare(`INSERT INTO players(id, display_name, first_seen_at, last_seen_at, stamina_updated_at) VALUES(?, ?, ?, ?, ?)`)
        .run(id, displayName, at, at, at);
      player = this.getPlayer(id)!;
    } else if (player.displayName !== displayName) {
      this.db.prepare("UPDATE players SET display_name = ?, last_seen_at = ? WHERE id = ?").run(displayName, now.toISOString(), id);
      player.displayName = displayName;
      player.lastSeenAt = now.toISOString();
    }
    const config = this.loadConfig();
    const maxStamina = Number(config["player.max_stamina"]) + Math.min(25, Math.max(0, player.level - 1));
    const elapsed = Math.max(0, (now.getTime() - new Date(player.staminaUpdatedAt).getTime()) / 1000);
    player.stamina = Math.min(maxStamina, player.stamina + elapsed * Number(config["player.stamina_regen"]));
    player.staminaUpdatedAt = now.toISOString();
    return player;
  }

  getPlayer(id: string): Player | null {
    const row = this.db.prepare("SELECT * FROM players WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToPlayer(row) : null;
  }

  savePlayer(player: Player): void {
    this.db.prepare(`UPDATE players SET display_name=?, last_seen_at=?, total_actions=?, total_contribution=?, xp=?, level=?, department=?, stamina=?, stamina_updated_at=?, currency=?, injuries_json=?, commendations_json=?, titles_json=?, active_title=?, inventory_json=?, statistics_json=?, moon_distance=?, disasters_survived=?, shifts_participated=?, last_action_at=?, disabled_until=? WHERE id=?`).run(
      player.displayName, player.lastSeenAt, player.totalActions, player.totalContribution, player.xp, player.level, player.department, player.stamina, player.staminaUpdatedAt, player.currency,
      JSON.stringify(player.injuries), JSON.stringify(player.commendations), JSON.stringify(player.titles), player.activeTitle, JSON.stringify(player.inventory), JSON.stringify(player.statistics), player.moonDistance,
      player.disastersSurvived, player.shiftsParticipated, player.lastActionAt, player.disabledUntil, player.id,
    );
  }

  applyAction(player: Player, command: string, contribution: number, staminaCost: number, now = new Date()): void {
    player.stamina = Math.max(0, player.stamina - staminaCost);
    player.staminaUpdatedAt = now.toISOString();
    player.lastActionAt = now.toISOString();
    player.lastSeenAt = now.toISOString();
    player.totalActions += 1;
    player.totalContribution += contribution;
    player.xp += contribution * 0.7;
    player.currency += contribution * 0.16;
    player.moonDistance += command === "haul" ? contribution * 0.025 : 0;
    player.statistics[command] = (player.statistics[command] ?? 0) + 1;
    player.level = Math.max(1, Math.floor(Math.sqrt(player.xp / 45)) + 1);
    this.unlockTitles(player);
    this.transaction(() => {
      this.savePlayer(player);
      this.db.prepare("INSERT INTO contributions(player_id, command, amount, created_at) VALUES(?, ?, ?, ?)").run(player.id, command, contribution, now.toISOString());
    });
  }

  recentContribution(playerId: string, now = new Date()): number {
    const cutoff = new Date(now.getTime() - 10_000).toISOString();
    const row = this.db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM contributions WHERE player_id = ? AND created_at >= ?").get(playerId, cutoff) as { total: number };
    return Number(row.total);
  }

  isProcessed(messageId: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM processed_chat_messages WHERE id = ?").get(messageId));
  }

  markProcessed(messageId: string, now = new Date()): void {
    this.db.prepare("INSERT OR IGNORE INTO processed_chat_messages(id, processed_at) VALUES(?, ?)").run(messageId, now.toISOString());
  }

  pruneProcessed(now = new Date()): void {
    this.db.prepare("DELETE FROM processed_chat_messages WHERE processed_at < ?").run(new Date(now.getTime() - 7 * 86400_000).toISOString());
    this.db.prepare("DELETE FROM contributions WHERE created_at < ?").run(new Date(now.getTime() - 30 * 86400_000).toISOString());
  }

  workers(query: WorkerQuery = {}): Player[] {
    const orders: Record<NonNullable<WorkerQuery["sort"]>, string> = { contribution: "total_contribution", xp: "xp", moonDistance: "moon_distance", shifts: "shifts_participated", disasters: "disasters_survived" };
    const order = orders[query.sort ?? "contribution"];
    const limit = Math.min(200, Math.max(1, query.limit ?? 100));
    const rows = query.search
      ? this.db.prepare(`SELECT * FROM players WHERE display_name LIKE ? OR id LIKE ? ORDER BY ${order} DESC LIMIT ?`).all(`%${query.search}%`, `%${query.search}%`, limit)
      : this.db.prepare(`SELECT * FROM players ORDER BY ${order} DESC LIMIT ?`).all(limit);
    return (rows as Array<Record<string, unknown>>).map((row) => this.rowToPlayer(row));
  }

  allPlayers(): Player[] {
    return (this.db.prepare("SELECT * FROM players").all() as Array<Record<string, unknown>>).map((row) => this.rowToPlayer(row));
  }

  updatePlayer(id: string, patch: Partial<Player>): Player {
    const player = this.getPlayer(id);
    if (!player) throw new Error("Worker not found");
    const allowed: Array<keyof Player> = ["xp", "level", "currency", "stamina", "department", "inventory", "injuries", "titles", "activeTitle", "commendations", "statistics", "totalContribution", "disabledUntil"];
    for (const key of allowed) if (patch[key] !== undefined) (player as unknown as Record<string, unknown>)[key] = patch[key];
    this.savePlayer(player);
    return player;
  }

  resetPlayer(id: string): Player {
    const existing = this.getPlayer(id);
    if (!existing) throw new Error("Worker not found");
    this.db.prepare("DELETE FROM players WHERE id = ?").run(id);
    return this.getOrCreatePlayer(id, existing.displayName);
  }

  deletePlayer(id: string): void {
    this.db.prepare("DELETE FROM players WHERE id = ?").run(id);
  }

  insertHistory(entries: EngineHistoryEntry[]): void {
    if (!entries.length) return;
    const statement = this.db.prepare("INSERT INTO event_history(event_id, event_name, outcome, details_json, severity, occurred_at) VALUES(?, ?, ?, ?, ?, ?)");
    this.transaction(() => entries.forEach((item) => statement.run(item.eventId, item.eventName, item.outcome, JSON.stringify(item.details), item.severity, item.occurredAt)));
  }

  history(limit = 100): Array<Record<string, unknown>> {
    const events = this.db.prepare("SELECT id, event_id, event_name, outcome, details_json, severity, occurred_at FROM event_history ORDER BY occurred_at DESC LIMIT ?").all(Math.min(500, limit)) as Array<Record<string, unknown>>;
    return events.map((item) => ({ ...item, details: JSON.parse(String(item.details_json)), details_json: undefined }));
  }

  insertScars(scars: WorldScar[]): void {
    if (!scars.length) return;
    const statement = this.db.prepare("INSERT OR IGNORE INTO world_scars(id, name, description, modifiers_json, acquired_at, source_event) VALUES(?, ?, ?, ?, ?, ?)");
    this.transaction(() => scars.forEach((item) => statement.run(item.id, item.name, item.description, JSON.stringify(item.modifiers), item.acquiredAt, item.sourceEvent)));
  }

  scars(): WorldScar[] {
    const rows = this.db.prepare("SELECT * FROM world_scars ORDER BY acquired_at DESC").all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), name: String(row.name), description: String(row.description), modifiers: JSON.parse(String(row.modifiers_json)), acquiredAt: String(row.acquired_at), sourceEvent: String(row.source_event) }));
  }

  eventSettings(): Array<Record<string, unknown>> {
    return this.db.prepare("SELECT * FROM event_settings ORDER BY event_id").all() as Array<Record<string, unknown>>;
  }

  updateEventSetting(id: string, patch: { enabled?: boolean; weight?: number; cooldownSeconds?: number; lastTriggeredAt?: string }): void {
    const row = this.db.prepare("SELECT * FROM event_settings WHERE event_id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error("Event not found");
    this.db.prepare("UPDATE event_settings SET enabled=?, weight=?, cooldown_seconds=?, last_triggered_at=? WHERE event_id=?").run(
      patch.enabled === undefined ? Number(row.enabled) : patch.enabled ? 1 : 0,
      patch.weight ?? Number(row.weight), patch.cooldownSeconds ?? Number(row.cooldown_seconds), patch.lastTriggeredAt ?? (row.last_triggered_at as string | null), id,
    );
  }

  audit(action: string, oldValue: unknown, newValue: unknown, ip?: string): void {
    this.db.prepare("INSERT INTO admin_audit_log(action, old_value_json, new_value_json, ip, created_at) VALUES(?, ?, ?, ?, ?)").run(action, JSON.stringify(oldValue ?? null), JSON.stringify(newValue ?? null), ip ?? null, new Date().toISOString());
  }

  audits(limit = 100): Array<Record<string, unknown>> {
    return this.db.prepare("SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>;
  }

  recordSnapshot(filename: string, reason: string, sizeBytes: number): void {
    this.db.prepare("INSERT INTO snapshots(filename, reason, size_bytes, created_at) VALUES(?, ?, ?, ?)").run(filename, reason, sizeBytes, new Date().toISOString());
  }

  snapshots(): Array<Record<string, unknown>> {
    return this.db.prepare("SELECT * FROM snapshots ORDER BY created_at DESC LIMIT 100").all() as Array<Record<string, unknown>>;
  }

  createSnapshot(destination: string, reason: string): number {
    const absolute = resolve(destination);
    mkdirSync(dirname(absolute), { recursive: true });
    const escaped = absolute.replaceAll("'", "''");
    this.db.exec(`VACUUM INTO '${escaped}'`);
    const size = statSync(absolute).size;
    this.recordSnapshot(absolute, reason, size);
    return size;
  }

  wipe(now = new Date()): void {
    this.transaction(() => {
      for (const table of ["contributions", "players", "event_history", "world_scars", "processed_chat_messages"]) this.db.exec(`DELETE FROM ${table}`);
      this.db.exec("DELETE FROM world_state; DELETE FROM game_config; DELETE FROM event_settings");
    });
    this.initialize(now);
  }

  counts(): { workers: number; history: number; scars: number } {
    const count = (table: string) => Number((this.db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total);
    return { workers: count("players"), history: count("event_history"), scars: count("world_scars") };
  }

  private unlockTitles(player: Player): void {
    const unlock = (title: string) => { if (!player.titles.includes(title)) player.titles.push(title); };
    if (player.totalActions >= 10) unlock("Person Who Touched The Lever");
    if (player.totalContribution >= 250) unlock("Certified Moon Puller");
    if ((player.statistics.haul ?? 0) >= 50) unlock("Cable Enthusiast");
    if ((player.statistics.stoke ?? 0) >= 40) unlock("Boiler Witness");
    if (player.level >= 10) unlock("Senior Gravity Technician");
    if (player.disastersSurvived >= 1) unlock("Night Shift Survivor");
  }

  private rowToPlayer(row: Record<string, unknown>): Player {
    return {
      id: String(row.id), displayName: String(row.display_name), firstSeenAt: String(row.first_seen_at), lastSeenAt: String(row.last_seen_at),
      totalActions: Number(row.total_actions), totalContribution: Number(row.total_contribution), xp: Number(row.xp), level: Number(row.level), department: String(row.department) as Player["department"],
      stamina: Number(row.stamina), staminaUpdatedAt: String(row.stamina_updated_at), currency: Number(row.currency), injuries: JSON.parse(String(row.injuries_json)), commendations: JSON.parse(String(row.commendations_json)),
      titles: JSON.parse(String(row.titles_json)), activeTitle: String(row.active_title), inventory: JSON.parse(String(row.inventory_json)), statistics: JSON.parse(String(row.statistics_json)), moonDistance: Number(row.moon_distance),
      disastersSurvived: Number(row.disasters_survived), shiftsParticipated: Number(row.shifts_participated), lastActionAt: row.last_action_at ? String(row.last_action_at) : null, disabledUntil: row.disabled_until ? String(row.disabled_until) : null,
    };
  }

  private transaction<T>(callback: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
