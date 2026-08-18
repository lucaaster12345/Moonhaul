import { randomUUID } from "node:crypto";
import type { ActionResult, Department, Player, WorldScar, WorldState } from "../shared/types.js";
import { defaultConfig, type GameConfig } from "./config.js";
import { EVENTS, eventById, type EventDefinition, type EventEffect } from "./events.js";
import { SeededRandom } from "./random.js";

export interface EngineActionInput {
  player: Player;
  message: string;
  now?: Date;
  recentContribution?: number;
}

export interface EngineHistoryEntry {
  eventId: string;
  eventName: string;
  outcome: string;
  details: Record<string, unknown>;
  occurredAt: string;
  severity: string;
}

interface CommandDefinition {
  stamina: number;
  department: Department;
  contribution: number;
  apply: (power: number) => void;
  verb: string;
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export class GameEngine {
  readonly state: WorldState;
  private config: GameConfig;
  private readonly rng: SeededRandom;
  private readonly pendingScars: WorldScar[] = [];
  private readonly pendingHistory: EngineHistoryEntry[] = [];
  private readonly eventTuning = new Map<string, { enabled: boolean; weight: number; cooldownSeconds: number; lastTriggeredAt?: string }>();
  private readonly actionBursts = new Map<string, { count: number; at: number }>();
  private readonly commandCooldowns = new Map<string, number>();
  private crewSize = 2;

  constructor(state: WorldState, config: GameConfig = defaultConfig(), seed = Date.now()) {
    this.state = structuredClone(state);
    this.config = { ...defaultConfig(), ...config };
    this.rng = new SeededRandom(seed);
    for (const event of EVENTS) this.eventTuning.set(event.id, { enabled: true, weight: event.weight, cooldownSeconds: event.cooldownSeconds });
  }

  setConfig(config: GameConfig): void {
    this.config = { ...defaultConfig(), ...config };
  }

  getConfig(): GameConfig {
    return { ...this.config };
  }

  setEventTuning(id: string, tuning: Partial<{ enabled: boolean; weight: number; cooldownSeconds: number; lastTriggeredAt: string }>): void {
    const current = this.eventTuning.get(id);
    if (current) this.eventTuning.set(id, { ...current, ...tuning });
  }

  getEventTuning(): Record<string, { enabled: boolean; weight: number; cooldownSeconds: number; lastTriggeredAt?: string }> {
    return Object.fromEntries(this.eventTuning);
  }

  setCrewSize(count: number): void {
    this.crewSize = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  }

  requiredParticipants(event: EventDefinition): number {
    // Incidents should ask a small active crew for meaningful participation,
    // without making the original large-channel thresholds impossible for a
    // one- or two-person night shift.
    return Math.max(1, Math.min(event.thresholdUnique, Math.ceil(this.crewSize * 0.75)));
  }

  tick(elapsedMs: number, now = new Date(), allowRandomEvents = true): void {
    if (this.state.paused || elapsedMs <= 0) return;
    const seconds = Math.min(elapsedMs / 1000, 300);
    const fallRate = this.number("moon.base_fall_rate") * this.state.moon.massModifier;
    const efficiency = this.state.machine.efficiency / 100;
    const lubrication = 0.7 + (this.state.machine.lubrication / 100) * 0.3;

    let autopilotForce = 0;
    if (this.bool("autopilot.enabled") && this.state.moon.altitude < this.number("autopilot.minimum_altitude")) {
      autopilotForce = fallRate * (1 + this.number("autopilot.efficiency"));
      this.state.currentAlert = "SKELETON CREW HOLDING MINIMUM ALTITUDE";
    } else if (this.state.currentAlert === "SKELETON CREW HOLDING MINIMUM ALTITUDE") {
      this.state.currentAlert = null;
    }

    const upward = this.state.currentHaulForce * efficiency * lubrication + autopilotForce;
    this.state.moon.velocity = upward - fallRate;
    const delta = this.state.moon.velocity * seconds;
    this.state.moon.altitude = clamp(this.state.moon.altitude + delta, 0, this.number("moon.maximum_altitude"));
    if (delta > 0) {
      this.state.moon.haulProgress += delta;
      this.state.world.totalDistanceHauled += delta;
    }
    this.state.currentHaulForce *= Math.exp(-this.number("moon.force_decay") * seconds);

    const fuelUse = Math.min(this.state.resources.fuel, this.number("boiler.fuel_per_tick") * seconds);
    this.state.resources.fuel -= fuelUse;
    this.state.machine.heat += fuelUse * this.number("boiler.heat_per_fuel");
    this.state.machine.power += ((fuelUse > 0 ? 62 : 12) - this.state.machine.power) * 0.002 * seconds;
    this.state.machine.heat += (36 + this.state.machine.power * 0.18 - this.state.machine.heat) * 0.0018 * seconds;
    this.state.machine.pressure += (this.state.machine.heat * 0.72 - this.state.machine.pressure) * 0.0015 * seconds;
    this.state.machine.cableTension += Math.abs(this.state.moon.velocity) * 0.06 * seconds - this.state.machine.lubrication * 0.0005 * seconds;
    this.state.machine.lubrication -= 0.0008 * seconds;
    this.state.resources.electricity = clamp(this.state.resources.electricity + (this.state.machine.power - 50) * 0.002 * seconds, 0, 1000);

    if (this.state.machine.heat > 100 || this.state.machine.pressure > 100 || this.state.machine.cableTension > 100) {
      const excess = Math.max(this.state.machine.heat, this.state.machine.pressure, this.state.machine.cableTension) - 100;
      this.state.machine.integrity -= excess * 0.004 * seconds;
      this.state.currentAlert = "MACHINE LIMIT EXCEEDED";
    }

    this.normalizeState();
    this.state.tick += 1;
    this.state.lastTickAt = now.toISOString();

    const shiftMs = this.number("simulation.shift_minutes") * 60_000;
    if (now.getTime() - new Date(this.state.world.shiftStartedAt).getTime() >= shiftMs) this.advanceShift(now);
    if (this.state.moon.altitude <= 0) this.catastrophicRecovery(now);
    if (this.state.machine.integrity <= 0) this.machineFailure(now);

    if (this.state.activeEvent && now >= new Date(this.state.activeEvent.endsAt)) this.resolveActiveEvent(now);
    if (allowRandomEvents && !this.state.activeEvent && now >= new Date(this.state.nextEventAt)) this.triggerRandomEvent(now);

    if (!this.state.milestone && this.state.world.totalDistanceHauled >= 1) {
      this.state.milestone = "FIRST KILOMETER HAULED";
      this.addFeed("milestone", "MILESTONE: First Kilometer Hauled. Accounting has opened a ledger.", now);
    }
  }

  applyOfflineProgress(elapsedMs: number, now = new Date()): void {
    const maximum = this.number("simulation.offline_max_hours") * 3_600_000;
    let remaining = Math.min(Math.max(elapsedMs, 0), maximum);
    while (remaining > 0) {
      const step = Math.min(remaining, 60_000);
      this.tick(step, new Date(now.getTime() - remaining + step), false);
      remaining -= step;
    }
    if (elapsedMs > 60_000) this.addFeed("system", `Skeleton crew logged ${Math.round(Math.min(elapsedMs, maximum) / 60_000)} offline minutes.`, now);
  }

  handlePlayerAction(input: EngineActionInput): ActionResult {
    const now = input.now ?? new Date();
    const raw = input.message.trim().slice(0, 200);
    if (!raw.startsWith("!")) return { accepted: false, response: "Not a command." };
    const [head, ...args] = raw.slice(1).toLowerCase().split(/\s+/);
    const command = head ?? "";
    const player = input.player;
    const utilityCommand = command === "join" || command === "status" || command === "help";
    if (!utilityCommand) {
      if (!this.commandCooldownReady(player.id, now)) return { accepted: false, response: "Command cooling down. Please wait a few seconds.", command };
      this.commandCooldowns.set(player.id, now.getTime());
    }
    if (player.disabledUntil && new Date(player.disabledUntil) > now) return { accepted: false, response: "Worker access is temporarily suspended.", command };

    if (command === "join") return { accepted: true, response: `${player.displayName} clocked in as ${player.activeTitle}.`, command };
    if (command === "status") return { accepted: true, response: `${player.displayName}: level ${player.level}, ${Math.floor(player.stamina)} stamina, ${Math.round(player.totalContribution)} contribution.`, command };
    if (command === "help") return { accepted: true, response: this.helpText(args[0]), command };
    if (this.state.paused) return { accepted: false, response: "Night shift paused by supervisor. Work commands are on hold.", command };

    const activeEvent = this.state.activeEvent ? eventById(this.state.activeEvent.id) : undefined;
    const eventChoice = activeEvent?.choices.find((choice) => choice.command === command);
    if (eventChoice && activeEvent && this.state.activeEvent) {
      const staminaCost = 8;
      if (player.stamina < staminaCost) return { accepted: false, response: "Insufficient stamina. The Moon recommends a short break.", command };
      if (!this.cooldownReady(player, now)) return { accepted: false, response: "Action cooling down.", command };
      const power = this.playerPower(player);
      const vote = this.state.activeEvent.votes[command] ?? { count: 0, power: 0, users: [] };
      vote.count += 1;
      vote.power += power * (vote.users.includes(player.id) ? 0.25 : 1);
      if (!vote.users.includes(player.id)) vote.users.push(player.id);
      this.state.activeEvent.votes[command] = vote;
      this.aggregateFeed(command, `${player.displayName} responded !${command}.`, now);
      return { accepted: true, response: `Response recorded for ${activeEvent.name}: !${command}.`, command, contribution: power, staminaCost };
    }

    const definition = this.commands()[command];
    const isEventCommand = EVENTS.some((event) => event.choices.some((choice) => choice.command === command));
    const eventOnlyCommand = isEventCommand && !definition;
    if (eventOnlyCommand && !activeEvent) return { accepted: false, response: `!${command} is disabled until an active incident calls for it.`, command };
    if (eventOnlyCommand && activeEvent) return { accepted: false, response: `!${command} is not part of the current incident.`, command };
    if (!definition) return { accepted: false, response: "Unknown command. Use !help for approved work.", command };
    if (activeEvent?.pausesNormalWork) return { accepted: false, response: `Normal work is suspended during ${activeEvent.name}. Use one of the incident commands shown on stream.`, command };
    if (!this.cooldownReady(player, now)) return { accepted: false, response: "Action cooling down.", command };
    if (player.stamina < definition.stamina) return { accepted: false, response: "Insufficient stamina. Please loiter responsibly." };
    if ((input.recentContribution ?? 0) >= this.number("player.window_contribution_cap")) return { accepted: false, response: "Short-window contribution limit reached." };

    const power = this.playerPower(player);
    definition.apply(power);
    const contribution = definition.contribution * power;
    this.aggregateFeed(command, `${player.displayName} ${definition.verb}.`, now);
    this.normalizeState();
    return { accepted: true, response: `${definition.verb[0]?.toUpperCase()}${definition.verb.slice(1)}.`, command, contribution, staminaCost: definition.stamina, department: definition.department };
  }

  triggerEvent(id: string, now = new Date()): boolean {
    const event = eventById(id);
    if (!event) return false;
    this.state.activeEvent = {
      id: event.id,
      startedAt: now.toISOString(),
      endsAt: new Date(now.getTime() + event.durationSeconds * 1000).toISOString(),
      votes: {},
    };
    const tuning = this.eventTuning.get(id);
    if (tuning) tuning.lastTriggeredAt = now.toISOString();
    if (id === "second-moon") this.state.moon.secondMoon = true;
    this.state.currentAlert = event.name;
    this.addFeed(event.rarity === "catastrophic" ? "catastrophe" : "event", event.name, now);
    this.pendingHistory.push({ eventId: event.id, eventName: event.name, outcome: "started", details: {}, occurredAt: now.toISOString(), severity: event.rarity });
    return true;
  }

  triggerRandomEvent(now = new Date(), rarity?: EventDefinition["rarity"]): boolean {
    const eligible = EVENTS.filter((event) => {
      const tuning = this.eventTuning.get(event.id);
      if (!tuning?.enabled || tuning.weight <= 0) return false;
      if (rarity && event.rarity !== rarity) return false;
      if (this.state.world.currentShift < event.minimumShift) return false;
      if (this.state.world.anomalyLevel < event.minimumAnomaly || this.state.world.anomalyLevel > event.maximumAnomaly) return false;
      if (tuning.lastTriggeredAt && now.getTime() - new Date(tuning.lastTriggeredAt).getTime() < tuning.cooldownSeconds * 1000) return false;
      return this.prerequisitesMet(event);
    });
    if (!eligible.length) {
      this.scheduleNextEvent(now);
      return false;
    }
    const total = eligible.reduce((sum, event) => sum + (this.eventTuning.get(event.id)?.weight ?? event.weight), 0);
    let roll = this.rng.next() * total;
    const selected = eligible.find((event) => ((roll -= this.eventTuning.get(event.id)?.weight ?? event.weight) <= 0)) ?? eligible[0]!;
    return this.triggerEvent(selected.id, now);
  }

  cancelEvent(now = new Date()): void {
    if (!this.state.activeEvent) return;
    const event = eventById(this.state.activeEvent.id);
    this.pendingHistory.push({ eventId: this.state.activeEvent.id, eventName: event?.name ?? this.state.activeEvent.id, outcome: "cancelled", details: {}, occurredAt: now.toISOString(), severity: "admin" });
    this.state.activeEvent = null;
    this.state.currentAlert = null;
    this.state.moon.secondMoon = false;
    this.scheduleNextEvent(now);
  }

  resolveActiveEvent(now = new Date()): void {
    const active = this.state.activeEvent;
    if (!active) return;
    const event = eventById(active.id);
    if (!event) return this.cancelEvent(now);
    const unique = new Set(Object.values(active.votes).flatMap((vote) => vote.users)).size;
    const ranked = event.choices
      .map((choice) => ({ choice, vote: active.votes[choice.command] ?? { count: 0, power: 0, users: [] as string[] } }))
      .sort((a, b) => b.vote.power + b.vote.users.length * 2 - (a.vote.power + a.vote.users.length * 2));
    const winner = ranked[0];
    let outcome = "failed";
    const requiredParticipants = this.requiredParticipants(event);
    if (winner && unique >= requiredParticipants && winner.vote.count > 0) {
      for (const item of winner.choice.effects) this.applyEffect(item, event, now);
      outcome = winner.choice.command;
      this.addFeed("resolution", `${event.name}: ${winner.choice.label}. ${event.rewards}`, now);
    } else {
      const baseDamage = event.rarity === "catastrophic" ? 18 : event.rarity === "rare" ? 9 : 4;
      const damage = this.crewSize <= 2 ? baseDamage * 0.65 : baseDamage;
      this.state.machine.integrity -= damage;
      const defendedAltitude = this.bool("autopilot.enabled") ? this.number("autopilot.minimum_altitude") - 2 : 0;
      this.state.moon.altitude = Math.max(defendedAltitude, this.state.moon.altitude - damage * 0.15);
      this.state.world.morale -= 3;
      this.addFeed("failure", `${event.name} received insufficient staffing. ${event.penalties}`, now);
    }
    this.pendingHistory.push({ eventId: event.id, eventName: event.name, outcome, details: { uniqueParticipants: unique, requiredParticipants, votes: active.votes }, occurredAt: now.toISOString(), severity: event.rarity });
    this.state.activeEvent = null;
    this.state.currentAlert = null;
    this.state.moon.secondMoon = false;
    this.normalizeState();
    this.scheduleNextEvent(now);
  }

  drainScars(): WorldScar[] {
    return this.pendingScars.splice(0);
  }

  drainHistory(): EngineHistoryEntry[] {
    return this.pendingHistory.splice(0);
  }

  private commands(): Record<string, CommandDefinition> {
    const cost = this.number("player.haul_stamina_cost");
    return {
      haul: { stamina: cost, department: "winch", contribution: 10, verb: "hauled the Moon", apply: (p) => { this.state.currentHaulForce += this.number("winch.haul_power") * p; this.state.machine.cableTension += 1.5 * p; } },
      brace: { stamina: 12, department: "winch", contribution: 8, verb: "braced the cable", apply: (p) => { this.state.machine.cableTension -= this.number("winch.brace_power") * p; } },
      release: { stamina: 8, department: "winch", contribution: 5, verb: "released cable under protest", apply: (p) => { this.state.machine.cableTension -= 7 * p; this.state.moon.altitude -= 0.25 * p; } },
      grease: { stamina: 10, department: "winch", contribution: 7, verb: "greased Winch III", apply: (p) => { this.state.machine.lubrication += 8 * p; this.state.resources.scrap -= 0.5; } },
      stoke: { stamina: 10, department: "boiler", contribution: 9, verb: "stoked the boiler", apply: (p) => { this.state.resources.fuel -= 3 * p; this.state.machine.power += 5 * p; this.state.machine.heat += 3 * p; } },
      shovel: { stamina: 16, department: "boiler", contribution: 13, verb: "shoveled an unreasonable amount of fuel", apply: (p) => { this.state.resources.fuel -= 7 * p; this.state.machine.power += 9 * p; this.state.machine.heat += 7 * p; } },
      dampen: { stamina: 9, department: "boiler", contribution: 7, verb: "dampened the fire", apply: (p) => { this.state.machine.heat -= 7 * p; this.state.machine.power -= 2 * p; } },
      vent: { stamina: 10, department: "cooling", contribution: 8, verb: "vented pressure", apply: (p) => { this.state.machine.pressure -= 9 * p; this.state.machine.power -= 1.5 * p; } },
      cool: { stamina: 10, department: "cooling", contribution: 9, verb: "cooled the machine", apply: (p) => { const used = Math.min(this.state.resources.coolant, 2 * p); this.state.resources.coolant -= used; this.state.machine.heat -= used * this.number("cooling.coolant_efficiency"); } },
      flush: { stamina: 18, department: "cooling", contribution: 14, verb: "flushed the cooling manifold", apply: (p) => { this.state.resources.coolant -= 5 * p; this.state.machine.heat -= 10 * p; this.state.machine.pressure -= 8 * p; } },
      tune: { stamina: 8, department: "signal", contribution: 7, verb: "tuned the Signal Room", apply: (p) => { this.state.machine.efficiency += 2 * p; this.state.world.anomalyLevel += 0.4 * p; } },
      listen: { stamina: 6, department: "signal", contribution: 5, verb: "listened to an unauthorized frequency", apply: (p) => { this.state.world.anomalyLevel += 0.7 * p; if (this.rng.next() < 0.12) this.state.resources.moonlight += 1; } },
      signal: { stamina: 14, department: "signal", contribution: 11, verb: "signaled something above the Moon", apply: (p) => { this.state.machine.efficiency += 4 * p; this.state.world.anomalyLevel += 1.2 * p; } },
      work: { stamina: 10, department: this.neededDepartment(), contribution: 8, verb: "reported for general work", apply: (p) => this.applyGeneralWork(p) },
    };
  }

  private neededDepartment(): Department {
    if (this.state.machine.heat > 70 || this.state.machine.pressure > 75) return "cooling";
    if (this.state.machine.power < 45) return "boiler";
    if (this.state.machine.cableTension > 70) return "winch";
    return "signal";
  }

  private applyGeneralWork(power: number): void {
    const department = this.neededDepartment();
    if (department === "cooling") { this.state.machine.heat -= 4 * power; this.state.machine.pressure -= 3 * power; }
    if (department === "boiler") { this.state.machine.power += 4 * power; this.state.resources.fuel -= 2 * power; }
    if (department === "winch") this.state.machine.cableTension -= 4 * power;
    if (department === "signal") this.state.machine.efficiency += 1.5 * power;
  }

  private commandCooldownReady(playerId: string, now: Date): boolean {
    const last = this.commandCooldowns.get(playerId);
    return last === undefined || now.getTime() - last >= this.number("player.command_cooldown_seconds") * 1000;
  }

  private cooldownReady(player: Player, now: Date): boolean {
    return !player.lastActionAt || now.getTime() - new Date(player.lastActionAt).getTime() >= this.number("player.action_cooldown_ms");
  }

  private playerPower(player: Player): number {
    const bonus = Math.min(this.number("player.max_level_bonus"), Math.max(0, player.level - 1) * 0.02);
    return this.number("player.base_action_power") * (1 + bonus);
  }

  private helpText(department?: string): string {
    const sections: Record<string, string> = {
      winch: "Winch: !haul, !brace, !release, !grease.",
      boiler: "Boiler: !stoke, !shovel, !dampen.",
      cooling: "Cooling: !vent, !cool, !flush.",
      signal: "Signal Room: !tune, !listen, !signal.",
    };
    return department && sections[department]
      ? sections[department]
      : "Core: !join, !status, !haul, and !work. Follow the incident order on stream; use !help <department> for optional specialist actions.";
  }

  private prerequisitesMet(event: EventDefinition): boolean {
    if (!event.prerequisites?.length) return true;
    return event.prerequisites.every((rule) => {
      const match = rule.match(/^([\w.]+)\s*([<>])\s*(\d+(?:\.\d+)?)$/);
      if (!match) return true;
      const value = this.readPath(match[1]!);
      const expected = Number(match[3]);
      return typeof value === "number" && (match[2] === ">" ? value > expected : value < expected);
    });
  }

  private applyEffect(item: EventEffect, event: EventDefinition, now: Date): void {
    if (item.path) {
      const current = this.readPath(item.path);
      if (item.set !== undefined) this.writePath(item.path, item.set);
      else if (typeof current === "number" && item.delta !== undefined) this.writePath(item.path, current + item.delta);
    }
    if (item.scar) this.pendingScars.push({ id: randomUUID(), ...item.scar, acquiredAt: now.toISOString(), sourceEvent: event.id });
    if (item.notice) this.addFeed("notice", item.notice, now);
  }

  private readPath(path: string): unknown {
    return path.split(".").reduce<unknown>((object, key) => object && typeof object === "object" ? (object as Record<string, unknown>)[key] : undefined, this.state);
  }

  private writePath(path: string, value: unknown): void {
    const keys = path.split(".");
    const last = keys.pop();
    let object: Record<string, unknown> = this.state as unknown as Record<string, unknown>;
    for (const key of keys) {
      const next = object[key];
      if (!next || typeof next !== "object") return;
      object = next as Record<string, unknown>;
    }
    if (last) object[last] = value;
  }

  private scheduleNextEvent(now: Date): void {
    const min = this.number("events.minimum_interval");
    const max = Math.max(min, this.number("events.maximum_interval"));
    this.state.nextEventAt = new Date(now.getTime() + (min + this.rng.next() * (max - min)) * 1000).toISOString();
  }

  private advanceShift(now: Date): void {
    this.state.world.currentShift += 1;
    this.state.world.totalShiftsSurvived += 1;
    this.state.world.shiftStartedAt = now.toISOString();
    this.state.world.daysSinceIncident += 1;
    this.state.world.morale += 3;
    this.addFeed("shift", `Shift ${this.state.world.currentShift} has begun. Previous staff are presumed accounted for.`, now);
  }

  private machineFailure(now: Date): void {
    this.state.world.disastersSurvived += 1;
    this.state.machine.integrity = 48;
    this.state.machine.power = 18;
    this.state.machine.heat = 70;
    this.state.moon.altitude = Math.max(8, this.state.moon.altitude - 9);
    this.state.resources.scrap = Math.max(0, this.state.resources.scrap - 40);
    this.state.world.daysSinceIncident = 0;
    this.pendingScars.push({ id: randomUUID(), name: "WINCH III HAS BEEN REBUILT AGAIN", description: "Several bolts predate causality.", modifiers: { "winch.haul_power": -0.001 }, acquiredAt: now.toISOString(), sourceEvent: "machine-failure" });
    this.pendingHistory.push({ eventId: "machine-failure", eventName: "MACHINE FAILURE", outcome: "reconstructed", details: {}, occurredAt: now.toISOString(), severity: "disaster" });
    this.addFeed("catastrophe", "MACHINE FAILURE. Emergency reconstruction completed with available shapes.", now);
  }

  private catastrophicRecovery(now: Date): void {
    this.state.world.catastropheCount += 1;
    this.state.world.disastersSurvived += 1;
    this.state.world.daysSinceIncident = 0;
    this.state.moon.altitude = 22;
    this.state.moon.velocity = 0;
    this.state.moon.massModifier = clamp(this.state.moon.massModifier + 0.04, 0.5, 3);
    this.state.machine.integrity = 55;
    this.state.machine.power = 35;
    this.state.machine.heat = 64;
    this.state.machine.pressure = 58;
    this.state.machine.cableTension = 68;
    this.state.resources.scrap = Math.max(50, this.state.resources.scrap * 0.45);
    this.state.world.morale = clamp(this.state.world.morale + 12);
    this.pendingScars.push({ id: randomUUID(), name: "THE MOON HAS TOUCHED THE GROUND", description: "The ground was formally reprimanded.", modifiers: { "moon.base_fall_rate": 0.00005 }, acquiredAt: now.toISOString(), sourceEvent: "lunar-ground-contact" });
    this.pendingHistory.push({ eventId: "lunar-ground-contact", eventName: "LUNAR GROUND CONTACT", outcome: "catastrophic recovery", details: { catastrophe: this.state.world.catastropheCount }, occurredAt: now.toISOString(), severity: "catastrophic" });
    this.state.activeEvent = null;
    this.triggerEvent("lunar-ground-contact", now);
  }

  private addFeed(kind: string, text: string, now: Date, userId?: string): void {
    this.state.recentActions.unshift({ at: now.toISOString(), kind, text, userId });
    this.state.recentActions = this.state.recentActions.slice(0, 24);
  }

  private aggregateFeed(kind: string, fallback: string, now: Date): void {
    const burst = this.actionBursts.get(kind);
    if (burst && now.getTime() - burst.at < 8000) {
      burst.count += 1;
      burst.at = now.getTime();
      const existing = this.state.recentActions.find((item) => item.kind === `action:${kind}`);
      if (existing) {
        const verbs: Record<string, string> = { haul: "hauled the Moon", brace: "braced the cable", stoke: "stoked the boiler", cool: "cooled the machine", tune: "tuned the Signal Room" };
        existing.text = `${burst.count} workers ${verbs[kind] ?? `issued !${kind}`}.`;
        existing.at = now.toISOString();
        return;
      }
    } else this.actionBursts.set(kind, { count: 1, at: now.getTime() });
    this.addFeed(`action:${kind}`, fallback, now);
  }

  private normalizeState(): void {
    const state = this.state;
    state.machine.integrity = clamp(state.machine.integrity);
    state.machine.heat = clamp(state.machine.heat, 0, 140);
    state.machine.pressure = clamp(state.machine.pressure, 0, 140);
    state.machine.power = clamp(state.machine.power);
    state.machine.cableTension = clamp(state.machine.cableTension, 0, 140);
    state.machine.lubrication = clamp(state.machine.lubrication);
    state.machine.efficiency = clamp(state.machine.efficiency, 10, 125);
    state.moon.instability = clamp(state.moon.instability);
    state.moon.anomalyLevel = clamp(state.moon.anomalyLevel);
    state.world.anomalyLevel = clamp(state.world.anomalyLevel);
    state.world.morale = clamp(state.world.morale);
    for (const key of Object.keys(state.resources) as Array<keyof typeof state.resources>) state.resources[key] = Math.max(0, state.resources[key]);
  }

  private number(key: string): number {
    const value = this.config[key];
    if (typeof value !== "number") throw new Error(`Config ${key} is not numeric`);
    return value;
  }

  private bool(key: string): boolean {
    return Boolean(this.config[key]);
  }
}
