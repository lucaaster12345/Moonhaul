import { describe, expect, it } from "vitest";
import { defaultConfig, freshWorld } from "../packages/game-engine/config.js";
import { GameEngine } from "../packages/game-engine/engine.js";
import { player } from "./helpers.js";

describe("game engine", () => {
  it("holds work commands while paused but keeps status available", () => {
    const engine = new GameEngine(freshWorld(new Date("2030-01-01T00:00:00Z")), defaultConfig(), 9);
    engine.state.paused = true;
    expect(engine.handlePlayerAction({ player: player(), message: "!haul" }).accepted).toBe(false);
    expect(engine.handlePlayerAction({ player: player(), message: "!status" }).accepted).toBe(true);
  });
  it("ticks independently of UI and moves the Moon", () => {
    const at = new Date("2030-01-01T00:00:00Z"); const engine = new GameEngine(freshWorld(at), defaultConfig(), 1); const before = engine.state.moon.altitude;
    engine.tick(1000, new Date(at.getTime() + 1000)); expect(engine.state.tick).toBe(1); expect(engine.state.moon.altitude).toBeLessThan(before);
  });
  it("applies useful commands with stamina and cooldown protections", () => {
    const engine = new GameEngine(freshWorld(new Date("2030-01-01T00:00:00Z")), defaultConfig(), 1); const worker = player();
    const first = engine.handlePlayerAction({ player: worker, message: "!haul", now: new Date("2030-01-01T00:00:03Z") }); expect(first.accepted).toBe(true); expect(first.staminaCost).toBe(10); expect(engine.state.currentHaulForce).toBeGreaterThan(0);
    worker.lastActionAt = "2030-01-01T00:00:03Z"; const second = engine.handlePlayerAction({ player: worker, message: "!haul", now: new Date("2030-01-01T00:00:03.500Z") }); expect(second.accepted).toBe(false); expect(second.response).toContain("cooling down");
    const tired = player({ stamina: 2 }); expect(engine.handlePlayerAction({ player: tired, message: "!stoke", now: new Date("2030-01-01T00:00:10Z") }).accepted).toBe(false);
  });
  it("throttles every work command and disables incident-only commands outside an incident", () => {
    const at = new Date("2030-01-01T00:00:00Z"); const engine = new GameEngine(freshWorld(at), defaultConfig(), 5); const worker = player();
    expect(engine.handlePlayerAction({ player: worker, message: "!stoke", now: at }).accepted).toBe(true);
    const spam = engine.handlePlayerAction({ player: worker, message: "!cool", now: new Date(at.getTime() + 1000) });
    expect(spam.accepted).toBe(false); expect(spam.response).toContain("Command cooling down");
    const incidentOnly = engine.handlePlayerAction({ player: player({ id: "p2" }), message: "!pray", now: new Date(at.getTime() + 1000) });
    expect(incidentOnly.accepted).toBe(false); expect(incidentOnly.response).toContain("disabled until an active incident");
  });
  it("holds standing work during incidents that pause normal operations", () => {
    const at = new Date("2030-01-01T00:00:00Z"); const engine = new GameEngine(freshWorld(at), defaultConfig(), 6); const worker = player();
    expect(engine.triggerEvent("boiler-wedding", at)).toBe(true);
    const result = engine.handlePlayerAction({ player: worker, message: "!haul", now: new Date(at.getTime() + 6000) });
    expect(result.accepted).toBe(false); expect(result.response).toContain("Normal work is suspended");
  });
  it("scales incident staffing to a one-person crew", () => {
    const at = new Date("2030-01-01T00:00:00Z"); const engine = new GameEngine(freshWorld(at), defaultConfig(), 7); engine.setCrewSize(1);
    expect(engine.triggerEvent("cable-slip", at)).toBe(true);
    const result = engine.handlePlayerAction({ player: player(), message: "!brace", now: new Date(at.getTime() + 5000) });
    expect(result.accepted).toBe(true);
    engine.resolveActiveEvent(new Date(at.getTime() + 60_000));
    expect(engine.drainHistory().some((item) => item.outcome === "brace")).toBe(true);
  });
  it("activates, votes on, and resolves data-driven events", () => {
    const at = new Date("2030-01-01T00:00:00Z"); const engine = new GameEngine(freshWorld(at), defaultConfig(), 2); expect(engine.triggerEvent("cable-slip", at)).toBe(true);
    for (let index = 0; index < 3; index += 1) { const worker = player({ id: `p${index}`, displayName: `P${index}` }); const result = engine.handlePlayerAction({ player: worker, message: "!brace", now: new Date(at.getTime() + 3000) }); expect(result.accepted).toBe(true); }
    const tension = engine.state.machine.cableTension; engine.resolveActiveEvent(new Date(at.getTime() + 50_000)); expect(engine.state.activeEvent).toBeNull(); expect(engine.state.machine.cableTension).toBeLessThan(tension); expect(engine.drainHistory().some((item) => item.outcome === "brace")).toBe(true);
  });
  it("consumes resources and performs catastrophic recovery", () => {
    const at = new Date("2030-01-01T00:00:00Z"); const config = defaultConfig(); config["autopilot.enabled"] = false; const engine = new GameEngine(freshWorld(at), config, 3); const fuel = engine.state.resources.fuel; engine.tick(5000, new Date(at.getTime() + 5000)); expect(engine.state.resources.fuel).toBeLessThan(fuel);
    engine.state.moon.altitude = 0.0001; engine.tick(1000, new Date(at.getTime() + 6000)); expect(engine.state.world.catastropheCount).toBe(1); expect(engine.state.moon.altitude).toBeGreaterThan(0); expect(engine.state.activeEvent?.id).toBe("lunar-ground-contact"); expect(engine.drainScars().length).toBeGreaterThan(0);
  });
  it("clamps offline progression and skips event storms", () => {
    const at = new Date("2030-01-01T00:00:00Z"); const config = defaultConfig(); config["simulation.offline_max_hours"] = 1; const engine = new GameEngine(freshWorld(at), config, 4); engine.applyOfflineProgress(72 * 3600_000, new Date(at.getTime() + 72 * 3600_000)); expect(engine.state.tick).toBe(60); expect(engine.drainHistory().filter((item) => item.outcome === "started")).toHaveLength(0);
  });
});
