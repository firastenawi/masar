import { eq } from "drizzle-orm";
import webpush from "web-push";
import type { PushPayload } from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { settings } from "../../db/schema";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** ok: وصل · gone: الاشتراك انتهى (يُحذف) · error: فشل مؤقت */
export type PushResult = { status: "ok" } | { status: "gone" } | { status: "error"; message: string };

export interface PushSender {
  readonly publicKey: string;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

const VAPID_KEY = "push.vapid";

/**
 * مفاتيح VAPID تُولَّد مرة واحدة وتُحفظ في القاعدة: تغييرها يُبطل كل اشتراكات الأجهزة.
 * المفتاح الخاص لا يغادر الخادم.
 */
export function loadOrCreateVapidKeys(db: AppDatabase): { publicKey: string; privateKey: string } {
  const row = db.select().from(settings).where(eq(settings.key, VAPID_KEY)).get();
  const value = row?.value as { publicKey?: string; privateKey?: string } | undefined;
  if (value?.publicKey && value.privateKey) return { publicKey: value.publicKey, privateKey: value.privateKey };

  const keys = webpush.generateVAPIDKeys();
  db.insert(settings).values({ key: VAPID_KEY, value: keys }).run();
  return keys;
}

export class WebPushSender implements PushSender {
  readonly publicKey: string;
  private readonly privateKey: string;

  constructor(
    keys: { publicKey: string; privateKey: string },
    private readonly subject: string,
  ) {
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
  }

  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: { subject: this.subject, publicKey: this.publicKey, privateKey: this.privateKey },
          // إن كان الجهاز مطفأً: نحاول التسليم خلال 6 ساعات ثم يُهمل (تذكير قديم بلا فائدة)
          TTL: 6 * 60 * 60,
          urgency: "normal",
          timeout: 15_000,
        },
      );
      return { status: "ok" };
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      // 404/410: المستخدم ألغى الإذن أو أزال التطبيق؛ الاشتراك لم يعد صالحاً
      if (statusCode === 404 || statusCode === 410) return { status: "gone" };
      return { status: "error", message: `${statusCode ?? ""} ${(error as Error).message}`.trim().slice(0, 300) };
    }
  }
}

/** للاختبارات: يحفظ ما "أُرسل"، ويمكن ضبط نتيجة كل جهاز */
export class FakePushSender implements PushSender {
  readonly publicKey = "test-public-key";
  readonly sent: Array<{ endpoint: string; payload: PushPayload }> = [];
  readonly results = new Map<string, PushResult>();

  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    const result = this.results.get(target.endpoint) ?? { status: "ok" };
    if (result.status === "ok") this.sent.push({ endpoint: target.endpoint, payload });
    return result;
  }
}
