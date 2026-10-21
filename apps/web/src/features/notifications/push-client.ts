import { apiSend } from "../../lib/api";

export type PushSupport =
  | "supported"
  /** المتصفح لا يدعم Web Push */
  | "unsupported"
  /** iPhone/iPad: يدعم فقط بعد إضافة التطبيق إلى الشاشة الرئيسية */
  | "ios-needs-install"
  /** الصفحة ليست https ولا localhost */
  | "insecure"
  /** نسخة التطوير (بلا Service Worker) */
  | "dev";

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return "insecure";
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  if (isIos && !standalone) return "ios-needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (!import.meta.env.PROD) return "dev";
  return "supported";
}

/** المفتاح العام بصيغة base64url ← الصيغة التي يطلبها pushManager.subscribe */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** يطلب الإذن (يجب أن يُستدعى من ضغطة زر) ثم يشترك ويرسل الاشتراك للخادم */
export async function enablePush(vapidPublicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("PERMISSION_DENIED");

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }
  await apiSend("POST", "/api/notifications/subscriptions", subscription.toJSON());
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await apiSend("POST", "/api/notifications/subscriptions/remove", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
