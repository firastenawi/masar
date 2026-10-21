import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  notificationSettingsSchema,
  notificationSettingsUpdateSchema,
  notificationStatusSchema,
  pushSubscriptionSchema,
  reminderCreateSchema,
  reminderSchema,
  reminderUpdateSchema,
  snoozeSchema,
} from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { badRequest } from "../../lib/errors";
import {
  createReminder,
  deleteReminder,
  deviceCount,
  getNotificationSettings,
  listReminders,
  recentLog,
  runDueReminders,
  sendTest,
  sentToday,
  snoozeReminder,
  subscribe,
  unsubscribe,
  updateNotificationSettings,
  updateReminder,
} from "./notifications.service";
import type { PushSender } from "./push";

const reminderParams = z.object({ reminderId: z.string().min(1) });

export const notificationsRoutes: FastifyPluginAsyncZod<{ db: AppDatabase; sender: PushSender }> = async (app, { db, sender }) => {
  app.get("/api/notifications/status", { schema: { response: { 200: notificationStatusSchema } } }, async () => ({
    vapidPublicKey: sender.publicKey,
    devices: deviceCount(db),
    sentToday: sentToday(db),
    settings: getNotificationSettings(db),
    recent: recentLog(db).map(({ reminderId: _r, ...entry }) => entry),
  }));

  app.patch(
    "/api/notifications/settings",
    { schema: { body: notificationSettingsUpdateSchema, response: { 200: notificationSettingsSchema } } },
    async (req) => {
      // منطقة زمنية غير معروفة تُفسد كل المواعيد: نتحقق منها قبل الحفظ
      if (req.body.timeZone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: req.body.timeZone });
        } catch {
          throw badRequest("INVALID_TIMEZONE", "المنطقة الزمنية غير معروفة");
        }
      }
      return updateNotificationSettings(db, req.body);
    },
  );

  app.post("/api/notifications/subscriptions", { schema: { body: pushSubscriptionSchema, response: { 204: z.null() } } }, async (req, reply) => {
    subscribe(db, req.body, req.headers["user-agent"]);
    return reply.status(204).send(null);
  });

  app.post(
    "/api/notifications/subscriptions/remove",
    { schema: { body: z.object({ endpoint: z.string().min(1) }), response: { 204: z.null() } } },
    async (req, reply) => {
      unsubscribe(db, req.body.endpoint);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/api/notifications/test",
    { schema: { response: { 200: z.object({ delivered: z.number().int(), errors: z.array(z.string()) }) } } },
    async () => {
      const result = await sendTest(db, sender);
      return { delivered: result.ok, errors: result.failed };
    },
  );

  app.get("/api/reminders", { schema: { response: { 200: z.array(reminderSchema) } } }, async () => listReminders(db));

  app.post("/api/reminders", { schema: { body: reminderCreateSchema, response: { 201: reminderSchema } } }, async (req, reply) =>
    reply.status(201).send(createReminder(db, req.body)),
  );

  app.patch(
    "/api/reminders/:reminderId",
    { schema: { params: reminderParams, body: reminderUpdateSchema, response: { 200: reminderSchema } } },
    async (req) => updateReminder(db, req.params.reminderId, req.body),
  );

  app.delete("/api/reminders/:reminderId", { schema: { params: reminderParams, response: { 204: z.null() } } }, async (req, reply) => {
    deleteReminder(db, req.params.reminderId);
    return reply.status(204).send(null);
  });

  // يُستدعى من زر "أجّل" داخل الإشعار نفسه (Service Worker)
  app.post(
    "/api/reminders/:reminderId/snooze",
    { schema: { params: reminderParams, body: snoozeSchema, response: { 200: reminderSchema } } },
    async (req) => snoozeReminder(db, req.params.reminderId, req.body.minutes),
  );
};

/** محرك التذكيرات: يفحص كل دقيقة. لا يعمل إلا والخادم يعمل (أي الكمبيوتر مشغّل) */
export function startReminderEngine(db: AppDatabase, sender: PushSender, log: FastifyBaseLogger): () => void {
  let running = false;
  const tick = async () => {
    if (running) return; // لا نبدأ دورة قبل انتهاء السابقة (الإرسال قد يبطئ)
    running = true;
    try {
      await runDueReminders(db, sender);
    } catch (error) {
      log.error(error, "reminder engine tick failed");
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
