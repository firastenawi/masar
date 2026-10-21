import { createHash, randomBytes } from "node:crypto";
import { eq, lt, ne } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { authSessions, settings } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { hashPassword, verifyPassword } from "./password";

const PASSWORD_KEY = "auth.password_hash";
/** الجلسة تنتهي بعد 30 يوماً من آخر استخدام */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** لا نحدّث "آخر استخدام" مع كل طلب، بل كل ساعة على الأكثر */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function storedHash(db: AppDatabase): string | null {
  const row = db.select().from(settings).where(eq(settings.key, PASSWORD_KEY)).get();
  return typeof row?.value === "string" ? row.value : null;
}

export function isConfigured(db: AppDatabase): boolean {
  return storedHash(db) !== null;
}

function createSession(db: AppDatabase, userAgent: string | undefined): string {
  const token = randomBytes(32).toString("base64url");
  db.insert(authSessions)
    .values({
      id: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      userAgent: userAgent?.slice(0, 300) ?? null,
    })
    .run();
  return token;
}

/** الإعداد الأول: يُضبط مرة واحدة فقط، وبعدها التغيير عبر changePassword */
export async function setupPassword(db: AppDatabase, password: string, userAgent?: string): Promise<string> {
  if (isConfigured(db)) throw new AppError(409, "ALREADY_CONFIGURED", "كلمة المرور مضبوطة مسبقاً");
  const hash = await hashPassword(password);
  db.insert(settings).values({ key: PASSWORD_KEY, value: hash }).run();
  return createSession(db, userAgent);
}

export async function login(db: AppDatabase, password: string, userAgent?: string): Promise<string> {
  const hash = storedHash(db);
  if (!hash) throw new AppError(409, "NOT_CONFIGURED", "لم تُضبط كلمة مرور بعد");
  if (!(await verifyPassword(password, hash))) {
    throw new AppError(401, "INVALID_PASSWORD", "كلمة المرور غير صحيحة");
  }
  return createSession(db, userAgent);
}

/** يرجع true إن كان الرمز صالحاً، ويمدّد الجلسة (انتهاء متحرّك) */
export function validateSession(db: AppDatabase, token: string | undefined): boolean {
  if (!token) return false;
  const id = sha256(token);
  const session = db.select().from(authSessions).where(eq(authSessions.id, id)).get();
  if (!session) return false;

  const now = Date.now();
  if (Date.parse(session.expiresAt) <= now) {
    db.delete(authSessions).where(eq(authSessions.id, id)).run();
    return false;
  }
  if (now - Date.parse(session.lastSeenAt) > TOUCH_INTERVAL_MS) {
    db.update(authSessions)
      .set({ lastSeenAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_TTL_MS).toISOString() })
      .where(eq(authSessions.id, id))
      .run();
  }
  return true;
}

export function logout(db: AppDatabase, token: string | undefined) {
  if (token) db.delete(authSessions).where(eq(authSessions.id, sha256(token))).run();
}

/** تغيير كلمة المرور يُخرج كل الأجهزة الأخرى، ويبقي الجهاز الحالي */
export async function changePassword(db: AppDatabase, currentToken: string, current: string, next: string) {
  const hash = storedHash(db);
  if (!hash || !(await verifyPassword(current, hash))) {
    throw new AppError(401, "INVALID_PASSWORD", "كلمة المرور الحالية غير صحيحة");
  }
  const newHash = await hashPassword(next);
  db.transaction((tx) => {
    tx.update(settings).set({ value: newHash, updatedAt: new Date().toISOString() }).where(eq(settings.key, PASSWORD_KEY)).run();
    tx.delete(authSessions).where(ne(authSessions.id, sha256(currentToken))).run();
  });
}

export function pruneExpiredSessions(db: AppDatabase) {
  db.delete(authSessions).where(lt(authSessions.expiresAt, new Date().toISOString())).run();
}
