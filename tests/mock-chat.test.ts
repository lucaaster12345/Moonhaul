import { describe, expect, it } from "vitest";
import { MockChatProvider } from "../packages/chat/mock.js";

describe("mock chat provider", () => {
  it("normalizes injected chat and exposes responses", async () => {
    const provider = new MockChatProvider(); let received = ""; await provider.start((message) => { received = `${message.userId}:${message.displayName}:${message.message}`; });
    await provider.inject({ userId: "10001", displayName: "RatKing", message: "!haul", id: "mock-1" }); expect(received).toBe("10001:RatKing:!haul"); await provider.send("Command accepted"); expect(provider.outbox()[0]).toBe("Command accepted"); await provider.updateChannelTitle("MOONHAUL | test"); expect(provider.channelTitles()[0]).toBe("MOONHAUL | test"); await provider.stop();
  });
});
