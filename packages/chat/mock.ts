import { randomUUID } from "node:crypto";
import type { NormalizedChatMessage } from "../shared/types.js";
import type { ChatHandler, ChatProvider } from "./provider.js";

export class MockChatProvider implements ChatProvider {
  readonly name = "mock";
  private handler: ChatHandler | null = null;
  private messages: string[] = [];
  private titles: string[] = [];

  async start(handler: ChatHandler): Promise<void> {
    this.handler = handler;
  }

  async stop(): Promise<void> {
    this.handler = null;
  }

  async send(message: string): Promise<void> {
    this.messages.unshift(message);
    this.messages = this.messages.slice(0, 50);
  }

  async updateChannelTitle(title: string): Promise<void> {
    this.titles.unshift(title);
    this.titles = this.titles.slice(0, 50);
  }

  async inject(input: { userId: string; displayName: string; message: string; id?: string; timestamp?: Date }): Promise<void> {
    if (!this.handler) throw new Error("Mock chat is not running");
    const normalized: NormalizedChatMessage = {
      id: input.id ?? `mock-${randomUUID()}`,
      userId: input.userId,
      displayName: input.displayName,
      message: input.message,
      timestamp: input.timestamp ?? new Date(),
      badges: [],
    };
    await this.handler(normalized);
  }

  status(): { provider: string; connected: boolean; detail: string } {
    return { provider: this.name, connected: Boolean(this.handler), detail: "Local injection ready" };
  }

  outbox(): string[] {
    return [...this.messages];
  }

  channelTitles(): string[] {
    return [...this.titles];
  }
}
