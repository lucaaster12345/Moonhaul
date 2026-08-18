import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MockChatProvider } from "../packages/chat/mock.js";
import { EVENTS } from "../packages/game-engine/events.js";
import { loadEnv } from "../server/env.js";
import { BASE_STREAM_TITLE, MoonhaulService, streamTitleForEvent } from "../server/service.js";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("stream title lifecycle", () => {
  it("publishes the base title and tracks event activation, cancellation, and resolution", async () => {
    const dir = mkdtempSync(join(tmpdir(), "moonhaul-title-test-"));
    dirs.push(dir);
    const env = loadEnv({ NODE_ENV: "test", DATABASE_PATH: join(dir, "game.db"), BACKUP_DIR: join(dir, "backups"), CHAT_PROVIDER: "mock" });
    const service = new MoonhaulService(env, () => {});
    const provider = service.provider as MockChatProvider;
    try {
      await service.start();
      await service.waitForStreamTitleUpdates();
      expect(provider.channelTitles()).toEqual([BASE_STREAM_TITLE]);

      const firstAt = new Date("2030-01-01T00:00:00.000Z");
      expect(service.triggerEvent("cable-slip", firstAt)).toBe(true);
      await service.waitForStreamTitleUpdates();
      expect(provider.channelTitles()[0]).toBe(streamTitleForEvent("CABLE SLIP DETECTED"));

      service.tick(1_000, new Date(firstAt.getTime() + 1_000));
      await service.waitForStreamTitleUpdates();
      expect(provider.channelTitles()).toHaveLength(2);

      service.cancelEvent(new Date(firstAt.getTime() + 2_000));
      await service.waitForStreamTitleUpdates();
      expect(provider.channelTitles()[0]).toBe(BASE_STREAM_TITLE);

      const secondAt = new Date("2030-01-01T00:01:00.000Z");
      expect(service.triggerEvent("boiler-pressure", secondAt)).toBe(true);
      await service.waitForStreamTitleUpdates();
      expect(provider.channelTitles()[0]).toBe(streamTitleForEvent("BOILER PRESSURE HEARING"));
      service.tick(45_000, new Date(secondAt.getTime() + 45_000));
      await service.waitForStreamTitleUpdates();
      expect(provider.channelTitles()[0]).toBe(BASE_STREAM_TITLE);
    } finally {
      await service.stop();
    }
  });

  it("keeps every configured incident title within Twitch's 140-character limit", () => {
    expect(EVENTS.every((event) => streamTitleForEvent(event.name).length <= 140)).toBe(true);
  });
});
