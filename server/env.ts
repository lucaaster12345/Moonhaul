import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DATABASE_PATH: z.string().default("./data/moonhaul.db"),
  BACKUP_DIR: z.string().default("./backups"),
  CHAT_PROVIDER: z.enum(["mock", "twitch"]).default("mock"),
  TWITCH_CLIENT_ID: z.string().default(""),
  TWITCH_CLIENT_SECRET: z.string().default(""),
  TWITCH_BROADCASTER_ID: z.string().default(""),
  TWITCH_BOT_USER_ID: z.string().default(""),
  TWITCH_ACCESS_TOKEN: z.string().default(""),
  TWITCH_REFRESH_TOKEN: z.string().default(""),
  TWITCH_BROADCAST_ACCESS_TOKEN: z.string().default(""),
  TWITCH_BROADCAST_REFRESH_TOKEN: z.string().default(""),
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("change-me"),
  SESSION_SECRET: z.string().min(12).default("change-me-now"),
  PUBLIC_BASE_URL: z.string().default("http://localhost:3000"),
  RANDOM_SEED: z.coerce.number().int().optional(),
  STREAM_ENABLED: z.string().default("false"),
  TWITCH_STREAM_KEY: z.string().default(""),
  STREAM_WIDTH: z.coerce.number().int().default(1280),
  STREAM_HEIGHT: z.coerce.number().int().default(720),
  STREAM_FPS: z.coerce.number().int().default(15),
  STREAM_BITRATE: z.string().default("1800k"),
});

export type AppEnv = z.infer<typeof schema>;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): AppEnv => {
  const env = schema.parse(source);
  if (env.CHAT_PROVIDER === "twitch") {
    const required = ["TWITCH_CLIENT_ID", "TWITCH_BROADCASTER_ID", "TWITCH_BOT_USER_ID", "TWITCH_ACCESS_TOKEN"] as const;
    const missing = required.filter((key) => !env[key]);
    if (missing.length) throw new Error(`Missing Twitch configuration: ${missing.join(", ")}`);
  }
  if (env.NODE_ENV === "production" && (env.ADMIN_PASSWORD === "change-me" || env.SESSION_SECRET === "change-me-now")) throw new Error("Set secure ADMIN_PASSWORD and SESSION_SECRET values before production startup");
  return env;
};
