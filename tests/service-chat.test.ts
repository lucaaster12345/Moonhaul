import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MockChatProvider } from "../packages/chat/mock.js";
import { loadEnv } from "../server/env.js";
import { MoonhaulService } from "../server/service.js";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("chat command feedback", () => {
  it("confirms accepted commands in chat and the live activity feed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "moonhaul-chat-test-"));
    dirs.push(dir);
    const env = loadEnv({ NODE_ENV: "test", DATABASE_PATH: join(dir, "game.db"), BACKUP_DIR: join(dir, "backups"), CHAT_PROVIDER: "mock" });
    const service = new MoonhaulService(env, () => {});
    const provider = service.provider as MockChatProvider;
    try {
      await service.start();
      const result = await service.processChat({ id: "chat-1", userId: "10001", displayName: "RatKing", message: "!haul", timestamp: new Date(), badges: [] });
      expect(result.accepted).toBe(true);
      expect(provider.outbox()[0]).toContain("@RatKing COMMAND ACCEPTED: !haul.");
      expect(service.engine.state.recentActions[0]).toMatchObject({ kind: "command-accepted", userId: "10001" });
    } finally {
      await service.stop();
    }
  });
});
