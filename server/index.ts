import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { EVENTS } from "../packages/game-engine/events.js";
import { loadEnv, type AppEnv } from "./env.js";
import { AdminAuth } from "./auth.js";
import { MoonhaulService } from "./service.js";
import { MockChatProvider } from "../packages/chat/mock.js";

const jsonBody = <T>(schema: z.ZodType<T>, request: FastifyRequest): T => schema.parse(request.body);

export async function buildServer(env: AppEnv = loadEnv()) {
  const app = Fastify({ logger: { level: env.NODE_ENV === "test" ? "silent" : "info" }, bodyLimit: 128 * 1024 });
  await app.register(cookie);
  await app.register(rateLimit, { max: 240, timeWindow: "1 minute" });
  const log = (level: string, message: string, context?: Record<string, unknown>) => {
    const method = ["info", "warn", "error", "debug"].includes(level) ? level as "info" | "warn" | "error" | "debug" : "info";
    app.log[method](context ?? {}, message);
  };
  const service = new MoonhaulService(env, log);
  const auth = new AdminAuth(env);

  app.get("/api/health", async () => ({ ok: true, tick: service.engine.state.tick, provider: service.provider.status() }));
  app.get("/api/state", async () => service.publicState());
  app.get("/api/events/current", async () => ({ active: service.engine.state.activeEvent, definition: service.engine.state.activeEvent ? EVENTS.find((event) => event.id === service.engine.state.activeEvent?.id) : null }));
  app.get("/api/workers", async (request) => {
    const query = z.object({ sort: z.enum(["contribution", "xp", "moonDistance", "shifts", "disasters"]).optional(), search: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }).parse(request.query);
    return { workers: service.database.workers(query) };
  });
  app.get("/api/workers/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(100) }).parse(request.params);
    const worker = service.database.getPlayer(id);
    return worker ? { worker } : reply.code(404).send({ error: "Worker not found" });
  });
  app.get("/api/history", async () => ({ history: service.database.history(200), scars: service.database.scars() }));
  app.get("/api/live", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const unsubscribe = service.subscribe((payload) => reply.raw.write(`event: state\ndata: ${payload}\n\n`));
    const heartbeat = setInterval(() => reply.raw.write(": keepalive\n\n"), 15_000);
    request.raw.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });

  app.post("/api/admin/login", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const body = jsonBody(z.object({ username: z.string().max(100), password: z.string().max(300) }), request);
    if (!auth.credentialsValid(body.username, body.password)) {
      service.database.audit("login-failed", null, { username: body.username }, request.ip);
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    const session = auth.create(reply);
    service.database.audit("login", null, { username: session.username }, request.ip);
    return { ok: true, username: session.username, csrf: session.csrf };
  });
  app.get("/api/admin/session", async (request, reply) => {
    const session = auth.require(request, reply);
    return session ? { authenticated: true, username: session.username, csrf: session.csrf } : undefined;
  });

  const adminGet = async (request: FastifyRequest, reply: FastifyReply) => Boolean(auth.require(request, reply));
  const adminPost = async (request: FastifyRequest, reply: FastifyReply) => Boolean(auth.requireCsrf(request, reply));

  app.post("/api/admin/logout", { preHandler: adminPost }, async (request, reply) => { auth.destroy(request, reply); return { ok: true }; });
  app.get("/api/admin/summary", { preHandler: adminGet }, async () => service.adminSummary());
  app.post("/api/admin/pause", { preHandler: adminPost }, async (request) => { const old = service.setPaused(true); service.database.audit("pause", old, true, request.ip); return { ok: true }; });
  app.post("/api/admin/resume", { preHandler: adminPost }, async (request) => { const old = service.setPaused(false); service.database.audit("resume", old, false, request.ip); return { ok: true }; });
  app.post("/api/admin/tick", { preHandler: adminPost }, async (request) => { const tick = service.runSingleTick(); service.database.audit("single-tick", null, tick, request.ip); return { ok: true }; });

  app.post("/api/admin/state", { preHandler: adminPost }, async (request) => {
    const body = jsonBody(z.object({ path: z.string(), value: z.union([z.number(), z.boolean(), z.string()]) }), request);
    const allowed = new Set(["moon.altitude", "moon.targetAltitude", "moon.velocity", "moon.instability", "moon.massModifier", "moon.anomalyLevel", "machine.integrity", "machine.heat", "machine.pressure", "machine.power", "machine.cableTension", "machine.lubrication", "machine.efficiency", "resources.fuel", "resources.coolant", "resources.scrap", "resources.spareParts", "resources.electricity", "resources.moonlight", "world.currentShift", "world.morale", "world.treasury", "world.anomalyLevel"]);
    if (!allowed.has(body.path)) throw new Error("State field is not editable");
    const keys = body.path.split("."); const last = keys.pop()!; let object = service.engine.state as unknown as Record<string, unknown>;
    for (const key of keys) object = object[key] as Record<string, unknown>;
    const old = object[last]; object[last] = body.value;
    service.database.saveWorld(service.engine.state); service.database.audit(`state:${body.path}`, old, body.value, request.ip);
    return { ok: true, state: service.engine.state };
  });
  app.post("/api/admin/config", { preHandler: adminPost }, async (request) => {
    const body = jsonBody(z.object({ key: z.string(), value: z.union([z.number(), z.boolean(), z.string()]) }), request);
    const old = service.engine.getConfig()[body.key]; service.database.setConfig(body.key, body.value); service.engine.setConfig(service.database.loadConfig()); service.restartTickTimer(); service.database.audit(`config:${body.key}`, old, body.value, request.ip);
    return { ok: true, config: service.database.configRows() };
  });
  app.post("/api/admin/config/reset", { preHandler: adminPost }, async (request) => {
    const body = jsonBody(z.object({ key: z.string().optional(), category: z.string().optional(), all: z.boolean().optional() }), request);
    service.database.resetConfig(body.all ? undefined : body.key, body.all ? undefined : body.category); service.engine.setConfig(service.database.loadConfig()); service.restartTickTimer(); service.database.audit("config-reset", null, body, request.ip);
    return { ok: true, config: service.database.configRows() };
  });
  app.post("/api/admin/config/reload", { preHandler: adminPost }, async (request) => { service.engine.setConfig(service.database.loadConfig()); service.restartTickTimer(); service.database.audit("config-reload", null, true, request.ip); return { ok: true }; });
  app.post("/api/admin/events/trigger", { preHandler: adminPost }, async (request) => { const body = jsonBody(z.object({ id: z.string() }), request); if (!service.triggerEvent(body.id)) throw new Error("Event not found"); service.database.audit("event-trigger", null, body, request.ip); return { ok: true }; });
  app.post("/api/admin/events/cancel", { preHandler: adminPost }, async (request) => { service.cancelEvent(); service.database.audit("event-cancel", null, null, request.ip); return { ok: true }; });
  app.post("/api/admin/events/update", { preHandler: adminPost }, async (request) => {
    const body = jsonBody(z.object({ id: z.string(), enabled: z.boolean().optional(), weight: z.number().min(0).max(1000).optional(), cooldownSeconds: z.number().int().min(0).max(864000).optional() }), request);
    service.database.updateEventSetting(body.id, body); service.engine.setEventTuning(body.id, body); service.database.audit("event-update", null, body, request.ip); return { ok: true };
  });

  app.post("/api/admin/mock", { preHandler: adminPost }, async (request) => {
    if (!(service.provider instanceof MockChatProvider)) return { error: "Mock provider is not active" };
    const body = jsonBody(z.object({ userId: z.string().min(1).max(80), displayName: z.string().min(1).max(80), message: z.string().min(1).max(200), id: z.string().optional() }), request);
    await service.provider.inject(body); service.database.audit("mock-chat", null, { ...body, message: body.message.slice(0, 60) }, request.ip); return { ok: true };
  });
  app.post("/api/admin/bots", { preHandler: adminPost }, async (request) => { const body = jsonBody(z.object({ count: z.number().int().min(0).max(500) }), request); service.setBots(body.count); service.database.audit("mock-bots", null, body, request.ip); return { ok: true }; });
  app.post("/api/admin/chaos", { preHandler: adminPost }, async (request) => { const body = jsonBody(z.object({ action: z.string() }), request); service.chaos(body.action); service.database.audit(`chaos:${body.action}`, null, true, request.ip); return { ok: true }; });
  app.post("/api/admin/snapshot", { preHandler: adminPost }, async (request) => { const result = service.snapshot("manual"); service.database.audit("snapshot", null, result, request.ip); return { ok: true, ...result }; });
  app.post("/api/admin/wipe", { preHandler: adminPost }, async (request, reply) => { const body = jsonBody(z.object({ phrase: z.literal("WIPE MOONHAUL"), confirm: z.literal(true) }), request); if (!body.confirm) return reply.code(400).send({ error: "Final confirmation required" }); service.wipe(request.ip); return { ok: true }; });
  app.patch("/api/admin/workers/:id", { preHandler: adminPost }, async (request) => { const { id } = z.object({ id: z.string() }).parse(request.params); const patch = z.record(z.string(), z.unknown()).parse(request.body); const old = service.database.getPlayer(id); const worker = service.database.updatePlayer(id, patch); service.database.audit("worker-update", old, worker, request.ip); return { worker }; });
  app.post("/api/admin/workers/:id/reset", { preHandler: adminPost }, async (request) => { const { id } = z.object({ id: z.string() }).parse(request.params); const old = service.database.getPlayer(id); const worker = service.database.resetPlayer(id); service.database.audit("worker-reset", old, worker, request.ip); return { worker }; });
  app.delete("/api/admin/workers/:id", { preHandler: adminPost }, async (request) => { const { id } = z.object({ id: z.string() }).parse(request.params); const old = service.database.getPlayer(id); service.database.deletePlayer(id); service.database.audit("worker-delete", old, null, request.ip); return { ok: true }; });

  if (env.NODE_ENV === "production") {
    await app.register(fastifyStatic, { root: resolve("dist"), prefix: "/" });
    app.setNotFoundHandler((request, reply) => request.url.startsWith("/api/") ? reply.code(404).send({ error: "Not found" }) : reply.sendFile("index.html"));
  }
  app.setErrorHandler((error, _request, reply) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const possibleStatus = (error as { statusCode?: unknown }).statusCode;
    app.log.error({ err: normalized }, "Request failed");
    const status = error instanceof z.ZodError ? 400 : (typeof possibleStatus === "number" && possibleStatus < 500 ? possibleStatus : 400);
    void reply.code(status).send({ error: error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join(", ") : normalized.message });
  });

  app.addHook("onClose", async () => service.stop());
  await service.start();
  return { app, service };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const env = loadEnv();
  const { app } = await buildServer(env);
  const port = env.API_PORT ?? env.PORT;
  await app.listen({ host: env.HOST, port });
  const shutdown = async (signal: string) => { app.log.info({ signal }, "Graceful shutdown"); await app.close(); process.exit(0); };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}
