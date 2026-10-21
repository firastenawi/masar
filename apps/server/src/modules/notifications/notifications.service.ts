import { createHash, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import {
  formatMinutes,
  isQuietTime,
  localParts,
  nextOccurrence,
  quietEndAfter,
  zonedTimeToUtc,
  type NotificationSettings,
  type PushPayload,
  type PushSubscriptionInput,
  type Reminder,
  type ReminderKind,
} from "@masar/shared";
import type { z } from "zod";
import type { reminderCreateSchema, reminderUpdateSchema } from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { notificationLog, pushSubscriptions, reminders, settings } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { getDashboard, getToday } from "../overview/overview.queries";
import { getTimeZone } from "../settings/settings.service";
import type { PushSender } from "./push";

const now = () => new Date().toISOString();

// ───────── الإعدادات ─────────

const SETTINGS_KEY = "notifications";
const DEFAULTS = { quietStart: "23:00", quietEnd: "07:00", maxPerDay: 4 };

export function getNotificationSettings(db: AppDatabase): NotificationSettings {
  const row = db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).get();
  const stored = (row?.value ?? {}) as Partial<NotificationSettings>;
  return { ...DEFAULTS, ...stored, timeZone: getTimeZone(db) };
}

function upsertSetting(db: AppDatabase, key: string, value: unknown) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now() } })
    .run();
}

export function updateNotificationSettings(db: AppDatabase, patch: Partial<NotificationSettings>) {
  const current = getNotificationSettings(db);
  const { timeZone, ...rest } = { ...current, ...patch };
  upsertSetting(db, SETTINGS_KEY, { quietStart: rest.quietStart, quietEnd: rest.quietEnd, maxPerDay: rest.maxPerDay });
  if (timeZone !== current.timeZone) {
    upsertSetting(db, "timezone", timeZone);
    rescheduleAll(db); // كل المواعيد محسوبة بالمنطقة الزمنية
  }
  return getNotificationSettings(db);
}

// ───────── الاشتراكات ─────────

export function subscribe(db: AppDatabase, input: PushSubscriptionInput, userAgent?: string) {
  const id = createHash("sha256").update(input.endpoint).digest("hex");
  db.insert(pushSubscriptions)
    .values({ id, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: input.keys.p256dh, auth: input.keys.auth, failureCount: 0 },
    })
    .run();
}

export function unsubscribe(db: AppDatabase, endpoint: string) {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

// ───────── التذكيرات ─────────

type ReminderRow = typeof reminders.$inferSelect;

function toReminder(row: ReminderRow): Reminder {
  const { createdAt: _c, updatedAt: _u, archivedAt: _a, ...rest } = row;
  return rest;
}

function computeNext(db: AppDatabase, row: Pick<ReminderRow, "time" | "days" | "enabled">, after = new Date()): string | null {
  if (!row.enabled) return null;
  return nextOccurrence(after, row.time, row.days, getTimeZone(db))?.toISOString() ?? null;
}

export function listReminders(db: AppDatabase): Reminder[] {
  return db.select().from(reminders).orderBy(asc(reminders.time)).all().map(toReminder);
}

export function createReminder(db: AppDatabase, input: z.output<typeof reminderCreateSchema>): Reminder {
  const row = db
    .insert(reminders)
    .values({ id: randomUUID(), ...input, body: input.body ?? null, nextFireAt: computeNext(db, input) })
    .returning()
    .get();
  return toReminder(row);
}

export function updateReminder(db: AppDatabase, id: string, patch: z.output<typeof reminderUpdateSchema>): Reminder {
  const before = db.select().from(reminders).where(eq(reminders.id, id)).get();
  if (!before) throw notFound("التذكير");
  const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as typeof patch;
  const merged = { ...before, ...changes };
  const row = db
    .update(reminders)
    .set({ ...changes, nextFireAt: computeNext(db, merged), updatedAt: now() })
    .where(eq(reminders.id, id))
    .returning()
    .get();
  return toReminder(row);
}

export function deleteReminder(db: AppDatabase, id: string) {
  const result = db.delete(reminders).where(eq(reminders.id, id)).run();
  if (result.changes === 0) throw notFound("التذكير");
}

/** تأجيل: الموعد القادم يصبح بعد N دقيقة، ثم يعود للجدول المعتاد بعد الإرسال */
export function snoozeReminder(db: AppDatabase, id: string, minutes: number): Reminder {
  const row = db
    .update(reminders)
    .set({ nextFireAt: new Date(Date.now() + minutes * 60_000).toISOString(), enabled: true, updatedAt: now() })
    .where(eq(reminders.id, id))
    .returning()
    .get();
  if (!row) throw notFound("التذكير");
  return toReminder(row);
}

export function rescheduleAll(db: AppDatabase) {
  for (const row of db.select().from(reminders).all()) {
    db.update(reminders).set({ nextFireAt: computeNext(db, row) }).where(eq(reminders.id, row.id)).run();
  }
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_REMINDERS: Array<{ kind: ReminderKind; title: string; time: string; days: number[]; enabled: boolean }> = [
  { kind: "due_digest", title: "مهام اليوم", time: "09:00", days: ALL_DAYS, enabled: true },
  { kind: "study", title: "وقت التعلم 📚", time: "20:00", days: ALL_DAYS, enabled: true },
  // الجمعة: بداية عطلة نهاية الأسبوع في أغلب البلدان العربية
  { kind: "weekly_summary", title: "ملخص أسبوعك", time: "19:00", days: [5], enabled: true },
  { kind: "weekly_review", title: "مراجعة الأهداف", time: "11:00", days: [6], enabled: false },
];

/** تذكيرات افتراضية معقولة عند أول تشغيل (يمكن تعديلها أو إيقافها) */
export function ensureDefaultReminders(db: AppDatabase) {
  const existing = db.select({ n: count() }).from(reminders).get();
  if ((existing?.n ?? 0) > 0) return;
  for (const r of DEFAULT_REMINDERS) createReminder(db, { ...r, body: null });
}

// ───────── محتوى الإشعار ─────────

/** نص الإشعار من بيانات المستخدم الفعلية؛ null = لا داعي للإرسال */
export function buildMessage(db: AppDatabase, reminder: Pick<Reminder, "id" | "kind" | "title" | "body">): PushPayload | null {
  const base = { title: reminder.title, tag: `reminder-${reminder.id}`, reminderId: reminder.id };

  switch (reminder.kind) {
    case "study": {
      const today = getToday(db);
      const streak = today.streak.current > 0 ? ` · السلسلة ${today.streak.current} 🔥` : "";
      const next = today.suggestion
        ? `خطوتك التالية: ${today.suggestion.task.title} (${today.suggestion.task.pathTitle})`
        : (reminder.body ?? "جلسة قصيرة اليوم تحافظ على استمراريتك");
      return { ...base, body: next + streak, url: "/today" };
    }
    case "due_digest": {
      const today = getToday(db);
      const total = today.overdue.length + today.dueToday.length;
      if (total === 0) return null;
      const first = today.overdue[0] ?? today.dueToday[0]!;
      const parts = [
        today.overdue.length ? `متأخرة: ${today.overdue.length}` : null,
        today.dueToday.length ? `مستحقة اليوم: ${today.dueToday.length}` : null,
      ].filter(Boolean);
      return { ...base, body: `${parts.join(" · ")} — ابدأ بـ «${first.title}»`, url: "/today" };
    }
    case "weekly_summary": {
      const d = getDashboard(db);
      return {
        ...base,
        body: `آخر 7 أيام: ${formatMinutes(d.minutesLast7Days)} تعلّم · ${d.tasksDoneLast7Days} مهام منجزة · السلسلة ${d.streak.current}` +
          (d.overdueCount ? ` · متأخرة ${d.overdueCount}` : ""),
        url: "/",
      };
    }
    case "weekly_review": {
      const d = getDashboard(db);
      const nearest = d.paths.filter((p) => p.targetDate).sort((a, b) => a.targetDate!.localeCompare(b.targetDate!))[0];
      const detail = nearest ? ` أقرب هدف: ${nearest.title} (${nearest.progress.percent}%) بحلول ${nearest.targetDate}.` : "";
      return { ...base, body: (reminder.body ?? "راجع خططك وعدّل ما يلزم.") + detail, url: "/paths" };
    }
    case "custom":
      return { ...base, body: reminder.body ?? "", url: "/today" };
  }
}

// ───────── الإرسال ─────────

function log(db: AppDatabase, entry: { reminderId: string | null; title: string; body: string; status: "sent" | "skipped" | "failed"; detail?: string }) {
  db.insert(notificationLog).values({ id: randomUUID(), ...entry, detail: entry.detail ?? null }).run();
}

/** عدد الإشعارات المرسلة منذ منتصف ليل اليوم المحلي */
export function sentToday(db: AppDatabase, at = new Date()): number {
  const tz = getTimeZone(db);
  const p = localParts(at, tz);
  const midnight = zonedTimeToUtc(p.year, p.month, p.day, 0, 0, tz).toISOString();
  const row = db
    .select({ n: count() })
    .from(notificationLog)
    .where(and(eq(notificationLog.status, "sent"), gte(notificationLog.createdAt, midnight)))
    .get();
  return row?.n ?? 0;
}

export function deviceCount(db: AppDatabase): number {
  return db.select({ n: count() }).from(pushSubscriptions).get()?.n ?? 0;
}

/** يرسل لكل الأجهزة المشتركة، ويحذف الاشتراكات المنتهية */
export async function deliver(db: AppDatabase, sender: PushSender, payload: PushPayload): Promise<{ ok: number; failed: string[] }> {
  const targets = db.select().from(pushSubscriptions).all();
  let ok = 0;
  const failed: string[] = [];
  for (const target of targets) {
    const result = await sender.send(target, payload);
    if (result.status === "ok") {
      ok += 1;
      db.update(pushSubscriptions).set({ lastSuccessAt: now(), failureCount: 0 }).where(eq(pushSubscriptions.id, target.id)).run();
    } else if (result.status === "gone" || target.failureCount >= 9) {
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id)).run();
    } else {
      failed.push(result.message);
      db.update(pushSubscriptions).set({ failureCount: target.failureCount + 1 }).where(eq(pushSubscriptions.id, target.id)).run();
    }
  }
  return { ok, failed };
}

export async function sendTest(db: AppDatabase, sender: PushSender) {
  const payload: PushPayload = {
    title: "مَسار ✓",
    body: "الإشعارات تعمل على هذا الجهاز.",
    url: "/settings",
    tag: "test",
    reminderId: null,
  };
  const result = await deliver(db, sender, payload);
  log(db, { reminderId: null, title: payload.title, body: payload.body, status: result.ok > 0 ? "sent" : "failed", detail: result.failed[0] ?? (result.ok ? "اختبار" : "لا توجد أجهزة مشتركة") });
  return result;
}

/** تذكير فات موعده بأكثر من هذا (الجهاز كان مطفأً) لا يُرسل متأخراً */
const MAX_LATENESS_MS = 2 * 60 * 60 * 1000;

/**
 * يعالج التذكيرات المستحقة. يُستدعى كل دقيقة.
 * الترتيب: فات الأوان؟ ← ساعات الهدوء (تأجيل) ← الحد اليومي ← المحتوى ← الأجهزة ← الإرسال.
 */
export async function runDueReminders(db: AppDatabase, sender: PushSender, at = new Date()) {
  const config = getNotificationSettings(db);
  const due = db
    .select()
    .from(reminders)
    .where(and(eq(reminders.enabled, true), isNotNull(reminders.nextFireAt), lte(reminders.nextFireAt, at.toISOString())))
    .orderBy(asc(reminders.nextFireAt))
    .all();

  for (const row of due) {
    const reschedule = (fired: boolean) =>
      db.update(reminders)
        .set({ nextFireAt: computeNext(db, row, at), ...(fired ? { lastFiredAt: at.toISOString() } : {}) })
        .where(eq(reminders.id, row.id))
        .run();
    const skip = (detail: string) => {
      log(db, { reminderId: row.id, title: row.title, body: "", status: "skipped", detail });
      reschedule(false);
    };

    if (at.getTime() - Date.parse(row.nextFireAt!) > MAX_LATENESS_MS) {
      skip("فات الموعد (كان الجهاز مطفأً)");
      continue;
    }
    if (isQuietTime(at, config.quietStart, config.quietEnd, config.timeZone)) {
      // تأجيل إلى نهاية الهدوء بدل الإلغاء
      db.update(reminders)
        .set({ nextFireAt: quietEndAfter(at, config.quietEnd, config.timeZone).toISOString() })
        .where(eq(reminders.id, row.id))
        .run();
      continue;
    }
    if (sentToday(db, at) >= config.maxPerDay) {
      skip(`تم بلوغ الحد اليومي (${config.maxPerDay})`);
      continue;
    }
    const payload = buildMessage(db, row);
    if (!payload) {
      skip("لا يوجد ما يُذكَّر به");
      continue;
    }
    if (deviceCount(db) === 0) {
      skip("لا توجد أجهزة مفعّل عليها الإشعارات");
      continue;
    }
    const result = await deliver(db, sender, payload);
    log(db, {
      reminderId: row.id,
      title: payload.title,
      body: payload.body,
      status: result.ok > 0 ? "sent" : "failed",
      ...(result.failed[0] ? { detail: result.failed[0] } : {}),
    });
    reschedule(true);
  }
}

export function recentLog(db: AppDatabase, limit = 15) {
  return db.select().from(notificationLog).orderBy(desc(notificationLog.createdAt)).limit(limit).all();
}
