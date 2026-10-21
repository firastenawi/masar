import { z } from "zod";

// ───────── المصادقة (مستخدم واحد بكلمة مرور) ─────────

export const passwordSchema = z
  .string({ error: "كلمة المرور مطلوبة" })
  .min(10, "كلمة المرور 10 أحرف على الأقل")
  .max(200, "كلمة المرور طويلة جداً");

export const setupSchema = z.object({ password: passwordSchema });
export const loginSchema = z.object({ password: z.string().min(1, "كلمة المرور مطلوبة").max(200) });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة").max(200),
  newPassword: passwordSchema,
});

export const authStatusSchema = z.object({
  /** هل ضُبطت كلمة مرور؟ إن لم تُضبط يظهر معالج الإعداد الأول */
  configured: z.boolean(),
  authenticated: z.boolean(),
  /** الإعداد الأول مسموح فقط من الجهاز نفسه (localhost) */
  setupAllowed: z.boolean(),
});
export type AuthStatus = z.infer<typeof authStatusSchema>;

// ───────── النسخ الاحتياطي ─────────

export const backupSchema = z.object({
  name: z.string(),
  sizeBytes: z.number().int(),
  createdAt: z.string(),
  reason: z.string(),
});
export type Backup = z.infer<typeof backupSchema>;

export const backupListSchema = z.object({
  directory: z.string(),
  copyDirectory: z.string().nullable(),
  backups: z.array(backupSchema),
});
export type BackupList = z.infer<typeof backupListSchema>;
