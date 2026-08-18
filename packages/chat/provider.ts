import type { NormalizedChatMessage } from "../shared/types.js";

export type ChatHandler = (message: NormalizedChatMessage) => Promise<void> | void;

export interface ChatProvider {
  readonly name: string;
  start(handler: ChatHandler): Promise<void>;
  stop(): Promise<void>;
  send(message: string, replyTo?: string): Promise<void>;
  updateChannelTitle(title: string): Promise<void>;
  status(): { provider: string; connected: boolean; detail: string };
}
