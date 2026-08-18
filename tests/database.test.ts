import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MoonhaulDatabase } from "../packages/database/index.js";

const dirs: string[] = [];
const make = () => { const dir = mkdtempSync(join(tmpdir(), "moonhaul-test-")); dirs.push(dir); return { dir, db: new MoonhaulDatabase(join(dir, "game.db")) }; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("SQLite persistence", () => {
  it("creates players by permanent ID and persists progress", () => {
    const { dir, db } = make(); const worker = db.getOrCreatePlayer("10001", "RatKing"); worker.totalContribution = 184; db.savePlayer(worker); db.close();
    const reopened = new MoonhaulDatabase(join(dir, "game.db")); expect(reopened.getPlayer("10001")?.displayName).toBe("RatKing"); expect(reopened.getPlayer("10001")?.totalContribution).toBe(184); reopened.close();
  });
  it("validates configuration and resets defaults", () => {
    const { db } = make(); expect(() => db.setConfig("player.max_stamina", -1)).toThrow(); db.setConfig("player.max_stamina", 140); expect(db.loadConfig()["player.max_stamina"]).toBe(140); db.resetConfig("player.max_stamina"); expect(db.loadConfig()["player.max_stamina"]).toBe(100); db.close();
  });
  it("deduplicates chat message IDs", () => {
    const { db } = make(); expect(db.isProcessed("evt-1")).toBe(false); db.markProcessed("evt-1"); expect(db.isProcessed("evt-1")).toBe(true); db.markProcessed("evt-1"); db.close();
  });
  it("creates a snapshot and wipes gameplay without credentials", () => {
    const { dir, db } = make(); db.getOrCreatePlayer("10001", "RatKing"); const snapshot = join(dir, "backup.db"); expect(db.createSnapshot(snapshot, "test")).toBeGreaterThan(0); db.wipe(); expect(db.counts().workers).toBe(0); expect(db.loadWorld().world.currentShift).toBe(1); expect(db.snapshots()).toHaveLength(1); db.close();
  });
});
