import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notificationStatusSchema, reminderSchema } from "@masar/shared";
import { buildApp } from "../../app";
import { openDatabase, type AppDatabase } from "../../db/client";
import { notificationLog, reminders } from "../../db/schema";
import {
  buildMessage,
  createReminder,
  ensureDefaultReminders,
  listReminders,
  runDueReminders,
  subscribe,
  updateNotificationSettings,
} from "./notifications.service";
import { FakePushSender } from "./push";

const TZ = "Asia/Damascus"; // UTC+3 طوال العام: اختبارات ثابتة
/** الخميس 2026-10-22 الساعة 20:00 بدمشق */
const AT = new Date("2026-10-22T17:00:00Z");

let db: AppDatabase;
let sender: FakePushSender;

beforeEach(() => {
  db = openDatabase(":memory:");
  sender = new FakePushSender();
  updateNotificationSettings(db, { timeZone: TZ, quietStart: "23:00", quietEnd: "07:00", maxPerDay: 4 });
});

afterEach(() => db.$client.close());

const device = (n = 1) =>
  subscribe(db, { endpoint: `https://push.example/${n}`, keys: { p256dh: "p", auth: "a" } });

/** تذكير مستحق الآن تماماً */
function dueReminder(over: Partial<Parameters<typeof createReminder>[1]> = {}) {
  const r = createReminder(db, { kind: "custom", title: "تذكير", body: "نص", time: "20:00", days: [0, 1, 2, 3, 4, 5, 6], enabled: true, ...over });
  db.update(reminders).set({ nextFireAt: AT.toISOString() }).where(eq(reminders.id, r.id)).run();
  return r;
}

const logs = () => db.select().from(notificationLog).all();
const reminderRow = (id: string) => db.select().from(reminders).where(eq(reminders.id, id)).get()!;

describe("التذكيرات الافتراضية", () => {
  it("تُنشأ مرة واحدة بمواعيد محسوبة بالمنطقة الزمنية", () => {
    ensureDefaultReminders(db);
    ensureDefaultReminders(db);
    const list = listReminders(db);
    expect(list.map((r) => r.kind).sort()).toEqual(["due_digest", "study", "weekly_review", "weekly_summary"]);
    const study = list.find((r) => r.kind === "study")!;
    // 20:00 بدمشق = 17:00 UTC
    expect(study.nextFireAt).toMatch(/T17:00:00\.000Z$/);
    expect(list.find((r) => r.kind === "weekly_review")!.nextFireAt).toBeNull(); // معطّل افتراضياً
  });
});

describe("محرك التذكيرات", () => {
  it("يرسل التذكير المستحق ويجدول الموعد التالي", async () => {
    device();
    const r = dueReminder();
    await runDueReminders(db, sender, AT);

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.payload).toMatchObject({ title: "تذكير", body: "نص", reminderId: r.id });
    const row = reminderRow(r.id);
    expect(row.lastFiredAt).toBe(AT.toISOString());
    expect(row.nextFireAt).toBe("2026-10-23T17:00:00.000Z");
    expect(logs()[0]).toMatchObject({ status: "sent" });
  });

  it("في ساعات الهدوء يؤجَّل إلى نهايتها بدل الإرسال", async () => {
    device();
    const night = new Date("2026-10-22T21:30:00Z"); // 00:30 بدمشق
    const r = dueReminder();
    db.update(reminders).set({ nextFireAt: night.toISOString() }).where(eq(reminders.id, r.id)).run();
    await runDueReminders(db, sender, night);

    expect(sender.sent).toHaveLength(0);
    expect(reminderRow(r.id).nextFireAt).toBe("2026-10-23T04:00:00.000Z"); // 07:00 بدمشق
  });

  it("يحترم الحد اليومي", async () => {
    device();
    updateNotificationSettings(db, { maxPerDay: 1 });
    dueReminder({ title: "أول" });
    dueReminder({ title: "ثانٍ" });
    await runDueReminders(db, sender, AT);

    expect(sender.sent).toHaveLength(1);
    expect(logs().find((l) => l.status === "skipped")?.detail).toMatch(/الحد اليومي/);
  });

  it("لا يرسل تذكيراً فات موعده بأكثر من ساعتين", async () => {
    device();
    dueReminder();
    await runDueReminders(db, sender, new Date(AT.getTime() + 3 * 60 * 60 * 1000));
    expect(sender.sent).toHaveLength(0);
    expect(logs()[0]!.detail).toMatch(/فات الموعد/);
  });

  it("ملخص المهام لا يُرسل إن لم يوجد شيء مستحق", async () => {
    device();
    dueReminder({ kind: "due_digest", title: "مهام اليوم" });
    await runDueReminders(db, sender, AT);
    expect(sender.sent).toHaveLength(0);
    expect(logs()[0]!.detail).toBe("لا يوجد ما يُذكَّر به");
  });

  it("بلا أجهزة مشتركة: يُسجَّل السبب", async () => {
    dueReminder();
    await runDueReminders(db, sender, AT);
    expect(logs()[0]!.detail).toMatch(/لا توجد أجهزة/);
  });

  it("يحذف الاشتراك المنتهي ويرسل للبقية", async () => {
    device(1);
    device(2);
    sender.results.set("https://push.example/1", { status: "gone" });
    dueReminder();
    await runDueReminders(db, sender, AT);
    expect(sender.sent.map((s) => s.endpoint)).toEqual(["https://push.example/2"]);

    const app = buildApp({ db, push: sender });
    const status = notificationStatusSchema.parse((await app.inject({ method: "GET", url: "/api/notifications/status" })).json());
    expect(status.devices).toBe(1);
    await app.close();
  });

  it("التذكير المعطّل لا يُرسل", async () => {
    device();
    const r = dueReminder({ enabled: false });
    db.update(reminders).set({ nextFireAt: AT.toISOString() }).where(eq(reminders.id, r.id)).run();
    await runDueReminders(db, sender, AT);
    expect(sender.sent).toHaveLength(0);
  });
});

describe("محتوى الإشعارات", () => {
  it("تذكير التعلم يقترح الخطوة التالية الفعلية", async () => {
    const app = buildApp({ db, push: sender });
    const path = (await app.inject({ method: "POST", url: "/api/paths", payload: { title: "DevOps" } })).json().id;
    const stage = (await app.inject({ method: "POST", url: `/api/paths/${path}/stages`, payload: { title: "Linux" } })).json().id;
    await app.inject({ method: "POST", url: `/api/stages/${stage}/tasks`, payload: { title: "الصلاحيات" } });

    const msg = buildMessage(db, { id: "x", kind: "study", title: "وقت التعلم", body: null });
    expect(msg?.body).toContain("خطوتك التالية: الصلاحيات (DevOps)");
    expect(msg?.url).toBe("/today");
    await app.close();
  });
});

describe("واجهة الإشعارات", () => {
  it("اشتراك، اختبار، تأجيل، وتحقق من المدخلات", async () => {
    const app = buildApp({ db, push: sender });
    const sub = await app.inject({
      method: "POST",
      url: "/api/notifications/subscriptions",
      payload: { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "p", auth: "a" } },
    });
    expect(sub.statusCode).toBe(204);

    const test = await app.inject({ method: "POST", url: "/api/notifications/test" });
    expect(test.json()).toEqual({ delivered: 1, errors: [] });

    const created = reminderSchema.parse(
      (await app.inject({ method: "POST", url: "/api/reminders", payload: { kind: "custom", title: "اشرب ماء", time: "10:00", days: [1, 3] } })).json(),
    );
    const before = Date.now();
    const snoozed = reminderSchema.parse(
      (await app.inject({ method: "POST", url: `/api/reminders/${created.id}/snooze`, payload: { minutes: 30 } })).json(),
    );
    const diff = Date.parse(snoozed.nextFireAt!) - before;
    expect(diff).toBeGreaterThan(29 * 60_000);
    expect(diff).toBeLessThan(31 * 60_000);

    const noDays = await app.inject({ method: "POST", url: "/api/reminders", payload: { kind: "custom", title: "x", time: "10:00", days: [] } });
    expect(noDays.statusCode).toBe(400);
    const badTime = await app.inject({ method: "POST", url: "/api/reminders", payload: { kind: "custom", title: "x", time: "25:00", days: [1] } });
    expect(badTime.statusCode).toBe(400);
    const badTz = await app.inject({ method: "PATCH", url: "/api/notifications/settings", payload: { timeZone: "Mars/Olympus" } });
    expect(badTz.json()).toMatchObject({ code: "INVALID_TIMEZONE" });

    // تغيير المنطقة الزمنية يعيد حساب المواعيد
    await app.inject({ method: "PATCH", url: `/api/reminders/${created.id}`, payload: { days: [0, 1, 2, 3, 4, 5, 6] } });
    await app.inject({ method: "PATCH", url: "/api/notifications/settings", payload: { timeZone: "UTC" } });
    expect(listReminders(db).find((r) => r.id === created.id)!.nextFireAt).toMatch(/T10:00:00\.000Z$/);
    await app.close();
  });
});
