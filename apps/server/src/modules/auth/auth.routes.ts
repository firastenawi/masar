import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authStatusSchema, changePasswordSchema, loginSchema, setupSchema, type ApiError } from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { parseCookies, serializeCookie } from "../../lib/cookies";
import { AppError } from "../../lib/errors";
import { FailureLimiter } from "../../lib/rate-limit";
import {
  changePassword,
  isConfigured,
  login,
  logout,
  SESSION_TTL_MS,
  setupPassword,
  validateSession,
} from "./auth.service";

export const SESSION_COOKIE = "masar_session";

/** مسارات متاحة بلا تسجيل دخول */
const PUBLIC_PATHS = new Set(["/api/health", "/api/auth/status", "/api/auth/login", "/api/auth/setup"]);

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * طلب من الجهاز نفسه مباشرة؟ (عبر Tailscale serve يصل الطلب من 127.0.0.1 أيضاً،
 * لكن مع ترويسة X-Forwarded-For، فنعتبره طلباً خارجياً)
 */
export function isDirectLocalRequest(request: FastifyRequest): boolean {
  return LOOPBACK.has(request.socket.remoteAddress ?? "") && !request.headers["x-forwarded-for"];
}

/** مضيف الأصل، أو null لأصل غير صالح مثل "null" (يُرفض) */
function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

const tokenOf = (request: FastifyRequest) => parseCookies(request.headers.cookie)[SESSION_COOKIE];

function setSessionCookie(request: FastifyRequest, reply: FastifyReply, token: string) {
  reply.header(
    "set-cookie",
    serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_TTL_MS / 1000, secure: request.protocol === "https" }),
  );
}

/**
 * يحمي كل مسارات /api: يتطلب جلسة صالحة، ويرفض طلبات التعديل القادمة من موقع آخر.
 * يُسجَّل على التطبيق الجذر حتى يشمل كل المسارات.
 */
export function registerAuthGuard(app: FastifyInstance, db: AppDatabase) {
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    if (!path.startsWith("/api/")) return; // ملفات الواجهة نفسها عامة؛ البيانات هي المحمية

    // حماية إضافية من CSRF: طلبات التعديل يجب أن تأتي من نفس الموقع
    if (request.method !== "GET" && request.method !== "HEAD") {
      const origin = request.headers.origin;
      if (origin && originHost(origin) !== request.headers.host) {
        const body: ApiError = { code: "FORBIDDEN_ORIGIN", message: "طلب مرفوض من مصدر غير معروف" };
        return reply.status(403).send(body);
      }
    }

    if (PUBLIC_PATHS.has(path)) return;
    if (!validateSession(db, tokenOf(request))) {
      const body: ApiError = { code: "UNAUTHENTICATED", message: "سجّل الدخول للمتابعة" };
      return reply.status(401).send(body);
    }
  });
}

export const authRoutes: FastifyPluginAsyncZod<{ db: AppDatabase }> = async (app, { db }) => {
  // 5 محاولات فاشلة كل 15 دقيقة لكل عنوان
  const limiter = new FailureLimiter(5, 15 * 60 * 1000);
  const ok = { 204: z.null() };

  app.get("/api/auth/status", { schema: { response: { 200: authStatusSchema } } }, async (request) => ({
    configured: isConfigured(db),
    authenticated: validateSession(db, tokenOf(request)),
    setupAllowed: isDirectLocalRequest(request),
  }));

  app.post("/api/auth/setup", { schema: { body: setupSchema, response: ok } }, async (request, reply) => {
    // ضبط كلمة المرور الأولى من الجهاز نفسه فقط، لا من الشبكة
    if (!isDirectLocalRequest(request)) {
      throw new AppError(403, "SETUP_LOCAL_ONLY", "اضبط كلمة المرور أول مرة من الكمبيوتر نفسه (localhost)");
    }
    const token = await setupPassword(db, request.body.password, request.headers["user-agent"]);
    setSessionCookie(request, reply, token);
    return reply.status(204).send(null);
  });

  app.post("/api/auth/login", { schema: { body: loginSchema, response: ok } }, async (request, reply) => {
    const key = request.ip;
    const wait = limiter.blockedFor(key);
    if (wait > 0) {
      throw new AppError(429, "TOO_MANY_ATTEMPTS", `محاولات كثيرة خاطئة. حاول بعد ${Math.ceil(wait / 60)} دقيقة`);
    }
    try {
      const token = await login(db, request.body.password, request.headers["user-agent"]);
      limiter.reset(key);
      setSessionCookie(request, reply, token);
      return reply.status(204).send(null);
    } catch (error) {
      if (error instanceof AppError && error.code === "INVALID_PASSWORD") limiter.fail(key);
      throw error;
    }
  });

  app.post("/api/auth/logout", { schema: { response: ok } }, async (request, reply) => {
    logout(db, tokenOf(request));
    reply.header("set-cookie", serializeCookie(SESSION_COOKIE, "", { maxAgeSeconds: 0 }));
    return reply.status(204).send(null);
  });

  app.post("/api/auth/password", { schema: { body: changePasswordSchema, response: ok } }, async (request, reply) => {
    await changePassword(db, tokenOf(request) ?? "", request.body.currentPassword, request.body.newPassword);
    return reply.status(204).send(null);
  });
};
