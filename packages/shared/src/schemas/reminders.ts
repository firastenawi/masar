import { z } from "zod";

/**
 * أنواع التذكيرات:
 * - study: موعد جلسة تعلم (يقترح الخطوة التالية)
 * - due_digest: ملخص المهام المتأخرة والمستحقة اليوم (لا يُرسل إن لم يوجد شيء)
 * - weekly_review: مراجعة الأهداف والخطة
 * - weekly_summary: ملخص تقدم الأسبوع بالأرقام
 * - custom: نص حر
 */
export const REMINDER_KINDS = ["study", "due_digest", "weekly_review", "weekly_summary", "custom"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "الوقت بصيغة HH:mm");
/** أيام الأسبوع: 0 = الأحد … 6 = السبت */
const weekdays = z
  .array(z.number().int().min(0).max(6))
  .min(1, "اختر يوماً واحداً على الأقل")
  .max(7)
  .transform((days) => [...new Set(days)].sort());

const reminderFields = {
  kind: z.enum(REMINDER_KINDS),
  title: z.string().trim().min(1, "العنوان مطلوب").max(120),
  body: z.string().trim().max(500).nullish(),
  time,
  days: weekdays,
  enabled: z.boolean(),
};

export const reminderCreateSchema = z.object({ ...reminderFields, enabled: z.boolean().default(true) });
export const reminderUpdateSchema = z.object(reminderFields).partial();
export const snoozeSchema = z.object({ minutes: z.number().int().min(5).max(24 * 60).default(30) });

export type ReminderCreateInput = z.input<typeof reminderCreateSchema>;
export type ReminderUpdateInput = z.input<typeof reminderUpdateSchema>;

export const reminderSchema = z.object({
  id: z.string(),
  kind: z.enum(REMINDER_KINDS),
  title: z.string(),
  body: z.string().nullable(),
  time: z.string(),
  days: z.array(z.number().int()),
  enabled: z.boolean(),
  nextFireAt: z.string().nullable(),
  lastFiredAt: z.string().nullable(),
});
export type Reminder = z.infer<typeof reminderSchema>;

// ───────── إعدادات الإشعارات ─────────

export const notificationSettingsSchema = z.object({
  timeZone: z.string().min(1).max(64),
  /** ساعات الهدوء: لا إشعارات بينها (قد تعبر منتصف الليل، مثل 23:00 → 07:00) */
  quietStart: time,
  quietEnd: time,
  /** الحد الأقصى لعدد الإشعارات يومياً */
  maxPerDay: z.number().int().min(1).max(20),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export const notificationSettingsUpdateSchema = notificationSettingsSchema.partial();

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const notificationStatusSchema = z.object({
  vapidPublicKey: z.string(),
  devices: z.number().int(),
  sentToday: z.number().int(),
  settings: notificationSettingsSchema,
  recent: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      body: z.string(),
      status: z.enum(["sent", "skipped", "failed"]),
      detail: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

/** ما يصل إلى Service Worker في الإشعار */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  reminderId: string | null;
}
