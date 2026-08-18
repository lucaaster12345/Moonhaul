import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "./env.js";

interface Session { username: string; csrf: string; expiresAt: number }

export class AdminAuth {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly env: AppEnv) {}

  credentialsValid(username: string, password: string): boolean {
    return this.safeEqual(username, this.env.ADMIN_USERNAME) && this.safeEqual(password, this.env.ADMIN_PASSWORD);
  }

  create(reply: FastifyReply): Session {
    const id = randomBytes(24).toString("hex");
    const signature = createHmac("sha256", this.env.SESSION_SECRET).update(id).digest("hex");
    const token = `${id}.${signature}`;
    const session = { username: this.env.ADMIN_USERNAME, csrf: randomBytes(24).toString("hex"), expiresAt: Date.now() + 12 * 3600_000 };
    this.sessions.set(id, session);
    reply.setCookie("moonhaul_admin", token, { path: "/", httpOnly: true, sameSite: "strict", secure: this.env.NODE_ENV === "production", maxAge: 12 * 3600 });
    return session;
  }

  destroy(request: FastifyRequest, reply: FastifyReply): void {
    const id = this.readId(request);
    if (id) this.sessions.delete(id);
    reply.clearCookie("moonhaul_admin", { path: "/" });
  }

  session(request: FastifyRequest): Session | null {
    const id = this.readId(request);
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session || session.expiresAt < Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    return session;
  }

  require(request: FastifyRequest, reply: FastifyReply): Session | null {
    const session = this.session(request);
    if (!session) {
      void reply.code(401).send({ error: "Admin authentication required" });
      return null;
    }
    return session;
  }

  requireCsrf(request: FastifyRequest, reply: FastifyReply): Session | null {
    const session = this.require(request, reply);
    if (!session) return null;
    const token = request.headers["x-csrf-token"];
    if (typeof token !== "string" || !this.safeEqual(token, session.csrf)) {
      void reply.code(403).send({ error: "CSRF token invalid" });
      return null;
    }
    return session;
  }

  private readId(request: FastifyRequest): string | null {
    const token = request.cookies.moonhaul_admin;
    if (!token) return null;
    const [id, signature] = token.split(".");
    if (!id || !signature) return null;
    const expected = createHmac("sha256", this.env.SESSION_SECRET).update(id).digest("hex");
    return this.safeEqual(signature, expected) ? id : null;
  }

  private safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
