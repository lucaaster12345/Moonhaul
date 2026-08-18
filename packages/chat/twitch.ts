import WebSocket from "ws";
import type { NormalizedChatMessage } from "../shared/types.js";
import type { ChatHandler, ChatProvider } from "./provider.js";

interface TwitchConfig {
  clientId: string;
  clientSecret: string;
  broadcasterId: string;
  botUserId: string;
  accessToken: string;
  refreshToken: string;
  broadcastAccessToken: string;
  broadcastRefreshToken: string;
}

export class TwitchChatProvider implements ChatProvider {
  readonly name = "twitch-eventsub";
  private socket: WebSocket | null = null;
  private handler: ChatHandler | null = null;
  private connected = false;
  private detail = "Not started";
  private reconnectTimer: NodeJS.Timeout | null = null;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private token: string;
  private refreshToken: string;
  private broadcastToken: string;
  private broadcastRefreshToken: string;
  private readonly sharesBroadcastToken: boolean;

  constructor(private readonly config: TwitchConfig, private readonly log: (level: string, message: string, context?: Record<string, unknown>) => void) {
    this.token = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.sharesBroadcastToken = !config.broadcastAccessToken && config.botUserId === config.broadcasterId;
    this.broadcastToken = config.broadcastAccessToken || (this.sharesBroadcastToken ? config.accessToken : "");
    this.broadcastRefreshToken = config.broadcastRefreshToken || (this.sharesBroadcastToken ? config.refreshToken : "");
  }

  async start(handler: ChatHandler): Promise<void> {
    this.handler = handler;
    await this.validateToken();
    this.connect("wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30");
  }

  async stop(): Promise<void> {
    this.handler = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.socket?.close();
    this.socket = null;
    this.connected = false;
    this.detail = "Stopped";
  }

  async send(message: string, replyTo?: string): Promise<void> {
    const response = await fetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Client-Id": this.config.clientId, "Content-Type": "application/json" },
      body: JSON.stringify({ broadcaster_id: this.config.broadcasterId, sender_id: this.config.botUserId, message: message.slice(0, 500), ...(replyTo ? { reply_parent_message_id: replyTo } : {}) }),
    });
    if (response.status === 401 && await this.refreshAccessToken()) return this.send(message, replyTo);
    if (!response.ok) throw new Error(`Twitch chat send failed (${response.status})`);
  }

  async updateChannelTitle(title: string): Promise<void> {
    if (!this.broadcastToken) throw new Error("Twitch title update skipped: configure TWITCH_BROADCAST_ACCESS_TOKEN with channel:manage:broadcast");
    await this.patchChannelTitle(title, true);
  }

  status(): { provider: string; connected: boolean; detail: string } {
    return { provider: this.name, connected: this.connected, detail: this.detail };
  }

  private connect(url: string): void {
    this.detail = "Connecting";
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.on("open", () => this.log("info", "Twitch EventSub socket opened"));
    socket.on("message", (data) => void this.onMessage(data.toString()));
    socket.on("error", (error) => this.log("error", "Twitch EventSub socket error", { error: error.message }));
    socket.on("close", () => {
      this.connected = false;
      this.detail = "Disconnected; retrying";
      if (this.handler && !this.reconnectTimer) this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect("wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30"); }, 5000);
    });
  }

  private async onMessage(raw: string): Promise<void> {
    const packet = JSON.parse(raw) as Record<string, any>;
    const type = String(packet.metadata?.message_type ?? "");
    this.resetKeepalive();
    if (type === "session_welcome") {
      this.connected = true;
      this.detail = "Connected and subscribing";
      await this.subscribe(String(packet.payload.session.id));
      this.detail = "Receiving channel.chat.message";
      return;
    }
    if (type === "session_reconnect") {
      const url = String(packet.payload.session.reconnect_url);
      this.socket?.close();
      this.connect(url);
      return;
    }
    if (type === "revocation") {
      this.detail = `Subscription revoked: ${String(packet.payload?.subscription?.status ?? "unknown")}`;
      this.log("error", "Twitch EventSub subscription revoked", { status: packet.payload?.subscription?.status });
      return;
    }
    if (type !== "notification" || packet.payload?.subscription?.type !== "channel.chat.message") return;
    const event = packet.payload.event;
    const message: NormalizedChatMessage = {
      id: String(event.message_id ?? packet.metadata.message_id),
      userId: String(event.chatter_user_id),
      displayName: String(event.chatter_user_name),
      message: String(event.message?.text ?? ""),
      timestamp: new Date(String(packet.metadata.message_timestamp)),
      badges: Array.isArray(event.badges) ? event.badges.map((badge: Record<string, unknown>) => String(badge.set_id)) : [],
    };
    await this.handler?.(message);
  }

  private async subscribe(sessionId: string): Promise<void> {
    const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Client-Id": this.config.clientId, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "channel.chat.message", version: "1", condition: { broadcaster_user_id: this.config.broadcasterId, user_id: this.config.botUserId }, transport: { method: "websocket", session_id: sessionId } }),
    });
    if (response.status === 401 && await this.refreshAccessToken()) return this.subscribe(sessionId);
    if (!response.ok) throw new Error(`Twitch EventSub subscription failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    this.log("info", "Twitch channel.chat.message subscription active");
  }

  private async validateToken(): Promise<void> {
    const response = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${this.token}` } });
    if (response.ok) return;
    if (!await this.refreshAccessToken()) throw new Error("Twitch user access token is invalid and could not be refreshed");
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken || !this.config.clientSecret) return false;
    const params = new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.refreshToken, client_id: this.config.clientId, client_secret: this.config.clientSecret });
    const response = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body: params });
    if (!response.ok) return false;
    const body = await response.json() as { access_token: string; refresh_token?: string };
    this.token = body.access_token;
    this.refreshToken = body.refresh_token ?? this.refreshToken;
    if (this.sharesBroadcastToken) {
      this.broadcastToken = this.token;
      this.broadcastRefreshToken = this.refreshToken;
    }
    this.log("info", "Twitch access token refreshed in memory");
    return true;
  }

  private async patchChannelTitle(title: string, allowRefresh: boolean): Promise<void> {
    const response = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(this.config.broadcasterId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.broadcastToken}`, "Client-Id": this.config.clientId, "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.slice(0, 140) }),
    });
    if (response.status === 401 && allowRefresh && await this.refreshBroadcastAccessToken()) return this.patchChannelTitle(title, false);
    if (!response.ok) throw new Error(`Twitch channel title update failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    this.log("info", "Twitch channel title updated", { title });
  }

  private async refreshBroadcastAccessToken(): Promise<boolean> {
    if (!this.broadcastRefreshToken || !this.config.clientSecret) return false;
    const params = new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.broadcastRefreshToken, client_id: this.config.clientId, client_secret: this.config.clientSecret });
    const response = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body: params });
    if (!response.ok) return false;
    const body = await response.json() as { access_token: string; refresh_token?: string };
    this.broadcastToken = body.access_token;
    this.broadcastRefreshToken = body.refresh_token ?? this.broadcastRefreshToken;
    if (this.sharesBroadcastToken) {
      this.token = this.broadcastToken;
      this.refreshToken = this.broadcastRefreshToken;
    }
    this.log("info", "Twitch broadcaster access token refreshed in memory");
    return true;
  }

  private resetKeepalive(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      this.log("warn", "Twitch EventSub keepalive timed out; reconnecting");
      this.socket?.terminate();
    }, 45_000);
  }
}
