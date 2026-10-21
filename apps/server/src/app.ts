import { tmpdir } from "node:os";
import path from "node:path";
import Fastify, { type FastifyError, type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { sql } from "drizzle-orm";
import { apiErrorSchema, healthResponseSchema, type ApiError } from "@masar/shared";
import type { AppDatabase } from "./db/client";
import { AppError } from "./lib/errors";
import { assistantRoutes } from "./modules/ai/assistant.routes";
import { FakeProvider } from "./modules/ai/fake.provider";
import type { AiProvider } from "./modules/ai/provider";
import { authRoutes, registerAuthGuard } from "./modules/auth/auth.routes";
import { backupRoutes } from "./modules/backup/backup.routes";
import type { BackupConfig } from "./modules/backup/backup.service";
import { notificationsRoutes } from "./modules/notifications/notifications.routes";
import { FakePushSender, type PushSender } from "./modules/notifications/push";
import { overviewRoutes } from "./modules/overview/overview.routes";
import { createStaticHandler } from "./modules/web/static";
import { roadmapRoutes } from "./modules/roadmap/roadmap.routes";
import { sessionsRoutes } from "./modules/sessions/sessions.routes";
import packageJson from "../package.json" with { type: "json" };

export interface AppDeps {
  db: AppDatabase;
  logger?: FastifyServerOptions["logger"];
  /** مزوّد الذكاء الاصطناعي؛ الافتراضي مزوّد وهمي (للاختبارات) */
  ai?: { provider: AiProvider; dailyLimit: number };
  /** تفرض تسجيل الدخول على /api. معطّلة افتراضياً للاختبارات فقط؛ server.ts يفعّلها دائماً */
  requireAuth?: boolean;
  backup?: BackupConfig;
  /** مجلد الواجهة المبنية لخدمتها من نفس الخادم (وضع التشغيل اليومي) */
  webDist?: string | null;
  /** مرسل إشعارات Web Push؛ الافتراضي وهمي (للاختبارات) */
  push?: PushSender;
}

export function buildApp({
  db,
  logger = false,
  ai = { provider: new FakeProvider(), dailyLimit: 1000 },
  requireAuth = false,
  backup = { dir: path.join(tmpdir(), "masar-test-backups"), copyDir: null },
  webDist = null,
  push = new FakePushSender(),
}: AppDeps) {
  const app = Fastify({
    logger,
    // Tailscale serve يمرّر الطلبات من الجهاز نفسه: نثق بترويساته فقط (لمعرفة https وعنوان العميل)
    trustProxy: ["127.0.0.1", "::1"],
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  if (requireAuth) registerAuthGuard(app, db);
  const serveStatic = webDist ? createStaticHandler(webDist) : null;

  // معالج أخطاء مركزي: التفاصيل التقنية تذهب للسجل، والمستخدم يرى رسالة مفهومة
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      const body: ApiError = { code: "VALIDATION_ERROR", message: "البيانات المُرسلة غير صالحة" };
      return reply.status(400).send(body);
    }
    // أخطاؤنا المتوقعة (ومنها أخطاء مزوّد الذكاء الاصطناعي 503/504) رسائلها مكتوبة للمستخدم
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.warn({ code: error.code }, error.message);
      const body: ApiError = { code: error.code, message: error.message };
      return reply.status(error.statusCode).send(body);
    }
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (status >= 500) request.log.error(error);
    const body: ApiError =
      status >= 500
        ? { code: "INTERNAL_ERROR", message: "حدث خطأ غير متوقع، حاول مرة أخرى" }
        : { code: error.code ?? "REQUEST_ERROR", message: error.message };
    return reply.status(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    if (serveStatic?.(request, reply)) return reply;
    const body: ApiError = { code: "NOT_FOUND", message: "المسار المطلوب غير موجود" };
    return reply.status(404).send(body);
  });

  app.get(
    "/api/health",
    { schema: { response: { 200: healthResponseSchema, 503: apiErrorSchema } } },
    async (request, reply) => {
      try {
        db.get(sql`select 1`);
      } catch (error) {
        request.log.error(error, "database health check failed");
        return reply
          .status(503)
          .send({ code: "DATABASE_UNAVAILABLE", message: "قاعدة البيانات غير متاحة" });
      }
      return {
        status: "ok" as const,
        database: "ok" as const,
        version: packageJson.version,
        time: new Date().toISOString(),
      };
    },
  );

  app.register(roadmapRoutes, { db });
  app.register(sessionsRoutes, { db });
  app.register(overviewRoutes, { db });
  app.register(assistantRoutes, { db, ...ai });
  app.register(authRoutes, { db });
  app.register(backupRoutes, { db, backup });
  app.register(notificationsRoutes, { db, sender: push });

  return app;
}
