import { existsSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import type { NormalizedChatMessage } from "../packages/shared/types.js";
import { freshWorld } from "../packages/game-engine/config.js";
import { GameEngine } from "../packages/game-engine/engine.js";
import { EVENTS, eventById } from "../packages/game-engine/events.js";
import { SeededRandom } from "../packages/game-engine/random.js";
import { MoonhaulDatabase } from "../packages/database/index.js";
import { MockChatProvider, TwitchChatProvider, type ChatProvider } from "../packages/chat/index.js";
import type { AppEnv } from "./env.js";

export const BASE_STREAM_TITLE = "MOONHAUL | Chat-Controlled Idle Game";
export const streamTitleForEvent = (eventName?: string | null): string => eventName
  ? `${BASE_STREAM_TITLE} — LIVE INCIDENT: ${eventName}`
  : BASE_STREAM_TITLE;

export class MoonhaulService {
  engine: GameEngine;
  readonly database: MoonhaulDatabase;
  readonly provider: ChatProvider;
  readonly startedAt = Date.now();
  readonly errors: Array<{ at: string; message: string }> = [];
  private tickTimer: NodeJS.Timeout | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  private botCount = 0;
  private lastPersistAt = 0;
  private lastBackupAt = Date.now();
  private lastStreamTitle: string | null = null;
  private titleUpdateQueue: Promise<void> = Promise.resolve();
  private readonly subscribers = new Set<(payload: string) => void>();
  private readonly botRng: SeededRandom;

  constructor(readonly env: AppEnv, private readonly log: (level: string, message: string, context?: Record<string, unknown>) => void) {
    this.database = new MoonhaulDatabase(env.DATABASE_PATH);
    this.botRng = new SeededRandom((env.RANDOM_SEED ?? Date.now()) + 1);
    const savedWorld = this.database.loadWorld();
    savedWorld.pausedAt ??= savedWorld.paused ? savedWorld.lastTickAt : null;
    this.engine = new GameEngine(savedWorld, this.database.loadConfig(), env.RANDOM_SEED);
    for (const row of this.database.eventSettings()) this.engine.setEventTuning(String(row.event_id), { enabled: Boolean(row.enabled), weight: Number(row.weight), cooldownSeconds: Number(row.cooldown_seconds), ...(row.last_triggered_at ? { lastTriggeredAt: String(row.last_triggered_at) } : {}) });
    this.provider = env.CHAT_PROVIDER === "twitch"
      ? new TwitchChatProvider({ clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET, broadcasterId: env.TWITCH_BROADCASTER_ID, botUserId: env.TWITCH_BOT_USER_ID, accessToken: env.TWITCH_ACCESS_TOKEN, refreshToken: env.TWITCH_REFRESH_TOKEN, broadcastAccessToken: env.TWITCH_BROADCAST_ACCESS_TOKEN, broadcastRefreshToken: env.TWITCH_BROADCAST_REFRESH_TOKEN }, log)
      : new MockChatProvider();
  }

  async start(): Promise<void> {
    const now = new Date();
    const offlineMs = now.getTime() - new Date(this.engine.state.lastTickAt).getTime();
    if (offlineMs > 2000) this.engine.applyOfflineProgress(offlineMs, now);
    this.flushEngine();
    await this.provider.start(async (message) => { await this.processChat(message); });
    await this.syncStreamTitle(true);
    this.restartTickTimer();
    this.log("info", "MOONHAUL simulation started", { provider: this.provider.name, offlineMs });
  }

  async stop(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.botTimer) clearInterval(this.botTimer);
    await this.titleUpdateQueue;
    await this.provider.stop();
    this.flushEngine(true);
    this.database.close();
  }

  restartTickTimer(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    const tickMs = Number(this.engine.getConfig()["simulation.tick_ms"]);
    this.tickTimer = setInterval(() => this.tick(tickMs), tickMs);
  }

  setPaused(paused: boolean, now = new Date()): boolean {
    const state = this.engine.state;
    const old = state.paused;
    if (old === paused) {
      this.broadcast();
      return old;
    }

    if (paused) {
      state.paused = true;
      state.pausedAt = now.toISOString();
      state.recentActions.unshift({ at: now.toISOString(), kind: "system", text: "Night shift placed on administrative hold." });
    } else {
      const pausedSince = new Date(state.pausedAt ?? state.lastTickAt).getTime();
      const pausedMs = Number.isFinite(pausedSince) ? Math.max(0, now.getTime() - pausedSince) : 0;
      const moveForward = (value: string) => new Date(new Date(value).getTime() + pausedMs).toISOString();
      state.world.shiftStartedAt = moveForward(state.world.shiftStartedAt);
      state.nextEventAt = moveForward(state.nextEventAt);
      if (state.activeEvent) state.activeEvent.endsAt = moveForward(state.activeEvent.endsAt);
      state.paused = false;
      state.pausedAt = null;
      state.lastTickAt = now.toISOString();
      state.recentActions.unshift({ at: now.toISOString(), kind: "system", text: "Administrative hold lifted. Night shift resumed." });
    }

    state.recentActions.splice(30);
    this.flushEngine(true);
    this.broadcast();
    return old;
  }

  runSingleTick(now = new Date()): number {
    const state = this.engine.state;
    const wasPaused = state.paused;
    const pausedAt = state.pausedAt;
    state.paused = false;
    this.engine.tick(Number(this.engine.getConfig()["simulation.tick_ms"]), now);
    state.paused = wasPaused;
    state.pausedAt = pausedAt;
    this.flushEngine(true);
    this.broadcast();
    void this.syncStreamTitle();
    return state.tick;
  }

  tick(elapsedMs: number, now = new Date()): void {
    this.engine.tick(elapsedMs, now);
    this.flushEngine(now.getTime() - this.lastPersistAt >= 5000);
    this.broadcast();
    void this.syncStreamTitle();
    void this.maybeAutomaticBackup(now);
  }

  async processChat(message: NormalizedChatMessage): Promise<{ accepted: boolean; response: string }> {
    if (message.message.length > 200) return { accepted: false, response: "Message exceeds the municipal command length." };
    if (this.database.isProcessed(message.id)) return { accepted: false, response: "Duplicate message ignored." };
    this.database.markProcessed(message.id, message.timestamp);
    const player = this.database.getOrCreatePlayer(message.userId, message.displayName, message.timestamp);
    const result = this.engine.handlePlayerAction({ player, message: message.message, now: message.timestamp, recentContribution: this.database.recentContribution(player.id, message.timestamp) });
    if (result.accepted && result.command && (result.contribution ?? 0) > 0) {
      if (result.department) player.department = result.department;
      if (player.statistics._lastShift !== this.engine.state.world.currentShift) {
        player.shiftsParticipated += 1;
        player.statistics._lastShift = this.engine.state.world.currentShift;
      }
      this.database.applyAction(player, result.command, result.contribution ?? 0, result.staminaCost ?? 0, message.timestamp);
    } else this.database.savePlayer(player);
    const rawMessage = message.message.trim();
    if (rawMessage.startsWith("!")) {
      const command = result.command ?? rawMessage.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "command";
      this.recordCommandFeedback(message, command, result.accepted, result.response);
      if (result.accepted) {
        try { await this.provider.send(`@${message.displayName} COMMAND ACCEPTED: !${command}. ${result.response}`, message.id); } catch (error) { this.recordError(error); }
      }
    }
    this.flushEngine(true);
    this.broadcast();
    return { accepted: result.accepted, response: result.response };
  }

  private recordCommandFeedback(message: NormalizedChatMessage, command: string, accepted: boolean, response: string): void {
    const prefix = accepted ? "COMMAND ACCEPTED" : "COMMAND REJECTED";
    const text = accepted
      ? `${prefix} · ${message.displayName} used !${command}.`
      : `${prefix} · !${command}: ${response}`;
    this.engine.state.recentActions.unshift({ at: message.timestamp.toISOString(), kind: accepted ? "command-accepted" : "command-rejected", text, userId: message.userId });
    this.engine.state.recentActions.splice(30);
  }

  snapshot(reason: string): { filename: string; size: number } {
    this.flushEngine(true);
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const filename = resolve(this.env.BACKUP_DIR, `moonhaul-${stamp}.db`);
    const size = this.database.createSnapshot(filename, reason);
    this.log("info", "Database snapshot created", { reason, size });
    return { filename, size };
  }

  triggerEvent(id: string, now = new Date()): boolean {
    if (!this.engine.triggerEvent(id, now)) return false;
    this.flushEngine(true);
    this.broadcast();
    void this.syncStreamTitle();
    return true;
  }

  cancelEvent(now = new Date()): void {
    this.engine.cancelEvent(now);
    this.flushEngine(true);
    this.broadcast();
    void this.syncStreamTitle();
  }

  waitForStreamTitleUpdates(): Promise<void> {
    return this.titleUpdateQueue;
  }

  wipe(ip?: string): void {
    const snapshot = this.snapshot("automatic-pre-wipe");
    this.database.wipe();
    this.engine = new GameEngine(this.database.loadWorld(), this.database.loadConfig(), this.env.RANDOM_SEED);
    this.database.audit("wipe-all-game-data", { snapshot: snapshot.filename }, { fresh: true }, ip);
    this.restartTickTimer();
    this.broadcast();
    void this.syncStreamTitle();
    this.log("warn", "All gameplay data wiped and reinitialized", { snapshot: snapshot.filename });
  }

  setBots(count: number): void {
    this.botCount = Math.max(0, Math.min(500, Math.floor(count)));
    if (this.botTimer) clearInterval(this.botTimer);
    this.botTimer = null;
    if (!this.botCount || !(this.provider instanceof MockChatProvider)) return;
    const provider = this.provider;
    const base = ["!haul", "!brace", "!grease", "!stoke", "!dampen", "!cool", "!vent", "!tune", "!listen", "!work"];
    this.botTimer = setInterval(() => {
      const index = this.botRng.int(0, this.botCount - 1);
      const event = this.engine.state.activeEvent ? eventById(this.engine.state.activeEvent.id) : null;
      const commands = event?.choices.map((choice) => `!${choice.command}`) ?? base;
      void provider.inject({ userId: `load-${index + 1}`, displayName: `NightWorker_${String(index + 1).padStart(3, "0")}`, message: this.botRng.pick(commands) });
    }, Math.max(80, 1200 - this.botCount * 2));
  }

  chaos(action: string): void {
    const state = this.engine.state;
    if (action === "drop-moon") state.moon.altitude *= 0.9;
    else if (action === "raise-moon") state.moon.altitude = Math.min(100, state.moon.altitude * 1.1);
    else if (action === "overheat") state.machine.heat = 118;
    else if (action === "repair") state.machine.integrity = 100;
    else if (action === "give-scrap") { for (const player of this.database.allPlayers()) { player.inventory.scrap = (player.inventory.scrap ?? 0) + 100; this.database.savePlayer(player); } }
    else if (action === "double-gravity") { state.moon.massModifier *= 2; setTimeout(() => { state.moon.massModifier /= 2; this.broadcast(); }, 5 * 60_000); }
    else if (action === "random-event") this.engine.triggerRandomEvent(new Date());
    else if (action === "rare-event") this.engine.triggerRandomEvent(new Date(), "rare");
    else if (action === "catastrophic-event") this.engine.triggerRandomEvent(new Date(), "catastrophic");
    else if (action === "huge-moon") { state.moon.temporaryScale = 1.8; setTimeout(() => { state.moon.temporaryScale = 1; this.broadcast(); }, 60_000); }
    else if (action === "second-moon") state.moon.secondMoon = !state.moon.secondMoon;
    else if (action === "random-scar") this.database.insertScars([{ id: randomUUID(), name: this.botRng.pick(["THE NIGHT HAS A RECEIPT", "CABLE #4 WAS NEVER INSTALLED", "THE SKY IS ZONED INDUSTRIAL", "TUESDAY HAS BEEN REPAIRED"]), description: this.botRng.pick(["No one remembers approving this.", "It remains within municipal tolerance.", "Future shifts must pretend this is useful."]), modifiers: {}, acquiredAt: new Date().toISOString(), sourceEvent: "admin-chaos" }]);
    else if (action === "emergency-shift") { state.world.currentShift += 1; state.currentAlert = "EMERGENCY SHIFT IN PROGRESS"; }
    else throw new Error("Unknown chaos action");
    this.flushEngine(true);
    this.broadcast();
    void this.syncStreamTitle();
  }

  publicState(): Record<string, unknown> {
    const active = this.engine.state.activeEvent ? eventById(this.engine.state.activeEvent.id) : null;
    return {
      state: this.engine.state,
      activeEvent: active,
      scars: this.database.scars().slice(0, 5),
      playerCount: this.database.counts().workers,
      chat: this.provider.status(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      mockBots: this.botCount,
    };
  }

  adminSummary(): Record<string, unknown> {
    const path = resolve(this.database.path);
    return {
      ...this.publicState(),
      config: this.database.configRows(),
      events: EVENTS.map((event) => ({ ...event, tuning: this.engine.getEventTuning()[event.id] })),
      counts: this.database.counts(),
      snapshots: this.database.snapshots(),
      audits: this.database.audits(40),
      recentErrors: this.errors,
      databaseSize: existsSync(path) ? statSync(path).size : 0,
      connectedWebClients: this.subscribers.size,
    };
  }

  subscribe(callback: (payload: string) => void): () => void {
    this.subscribers.add(callback);
    callback(JSON.stringify(this.publicState()));
    return () => this.subscribers.delete(callback);
  }

  private broadcast(): void {
    if (!this.subscribers.size) return;
    const payload = JSON.stringify(this.publicState());
    for (const callback of this.subscribers) callback(payload);
  }

  private syncStreamTitle(force = false): Promise<void> {
    const event = this.engine.state.activeEvent ? eventById(this.engine.state.activeEvent.id) : null;
    const title = streamTitleForEvent(event?.name);
    if (!force && title === this.lastStreamTitle) return this.titleUpdateQueue;
    this.lastStreamTitle = title;
    this.titleUpdateQueue = this.titleUpdateQueue
      .then(() => this.provider.updateChannelTitle(title))
      .catch((error) => this.recordError(error));
    return this.titleUpdateQueue;
  }

  private flushEngine(force = false): void {
    this.database.insertHistory(this.engine.drainHistory());
    this.database.insertScars(this.engine.drainScars());
    if (force) {
      this.database.saveWorld(this.engine.state);
      this.lastPersistAt = Date.now();
    }
  }

  private async maybeAutomaticBackup(now: Date): Promise<void> {
    const hours = Number(this.engine.getConfig()["backups.interval_hours"]);
    if (!hours || now.getTime() - this.lastBackupAt < hours * 3600_000) return;
    this.lastBackupAt = now.getTime();
    try { this.snapshot("automatic"); } catch (error) { this.recordError(error); }
  }

  private recordError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.errors.unshift({ at: new Date().toISOString(), message });
    this.errors.splice(20);
    this.log("error", message);
  }
}
