import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";

/** جذر المستودع (masar/) بغض النظر عن المجلد الذي شُغّل منه الأمر */
export const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // اسم مميز وليس PORT: أدوات التشغيل تضبط PORT للواجهة أحياناً فيتعارض المنفذان
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  DATA_DIR: z.string().min(1).default(path.join(REPO_ROOT, "data")),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // ───── المساعد الذكي ─────
  /** claude-code: اشتراكك عبر Claude Code المثبّت · fake: ردود تجريبية بلا اتصال */
  AI_PROVIDER: z.enum(["claude-code", "fake"]).default("claude-code"),
  /** مسار claude.exe إن لم يُكتشف تلقائياً */
  CLAUDE_BIN: z.string().min(1).optional(),
  /** النموذج (مثل sonnet أو opus)؛ فارغ = افتراضي حسابك في Claude Code */
  AI_MODEL: z.string().min(1).optional(),
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(60),
  AI_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(900_000).default(180_000),

  // ───── النسخ الاحتياطي ─────
  /** مجلد إضافي تُنسخ إليه كل نسخة (مثلاً داخل OneDrive أو Google Drive) */
  BACKUP_COPY_DIR: z.string().min(1).optional(),

  // ───── الإشعارات ─────
  /** جهة اتصال VAPID تُرسل لخدمات الإشعارات (Google/Apple/Mozilla) مع كل إشعار */
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, "يبدأ بـ mailto: أو https://").default("mailto:masar-app@example.com"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * يقرأ متغيرات البيئة من masar/.env (إن وُجد) ويتحقق منها.
 * إذا كانت قيمة غير صالحة يتوقف الخادم برسالة واضحة بدل أن يعمل بإعدادات خاطئة.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const envFile = path.join(REPO_ROOT, ".env");
  if (source === process.env && existsSync(envFile)) {
    // متغيرات البيئة الفعلية تتقدّم على ملف .env (مثل dotenv)؛ process.loadEnvFile كان يكتب فوقها
    for (const [key, value] of Object.entries(parseEnv(readFileSync(envFile, "utf8")))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }

  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`إعدادات البيئة غير صالحة:\n${details}`);
  }
  return result.data;
}
