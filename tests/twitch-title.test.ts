import { afterEach, describe, expect, it, vi } from "vitest";
import { TwitchChatProvider } from "../packages/chat/twitch.js";

afterEach(() => vi.unstubAllGlobals());

describe("Twitch channel title adapter", () => {
  it("patches the broadcaster channel with the broadcaster token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new TwitchChatProvider({
      clientId: "client-1", clientSecret: "secret-1", broadcasterId: "broadcaster-1", botUserId: "bot-1",
      accessToken: "chat-token", refreshToken: "chat-refresh", broadcastAccessToken: "broadcast-token", broadcastRefreshToken: "broadcast-refresh",
    }, () => {});
    const title = "MOONHAUL | Chat-Controlled Idle Game — LIVE INCIDENT: CABLE SLIP DETECTED";

    await provider.updateChannelTitle(title);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.twitch.tv/helix/channels?broadcaster_id=broadcaster-1");
    expect(options.method).toBe("PATCH");
    expect(options.headers).toMatchObject({ Authorization: "Bearer broadcast-token", "Client-Id": "client-1" });
    expect(JSON.parse(String(options.body))).toEqual({ title });
  });
});
