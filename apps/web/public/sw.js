// Service Worker لمَسار: يجعل التطبيق قابلاً للتثبيت، ويفتح الواجهة بسرعة، ويستقبل الإشعارات.
// - ملفات /assets (بأسماء فيها بصمة) تُخزَّن وتُقدَّم من الذاكرة.
// - الصفحة نفسها: من الشبكة أولاً، ومن الذاكرة إن انقطع الاتصال.
// - بيانات /api لا تُخزَّن هنا أبداً (خاصة ومحمية بتسجيل الدخول).
const CACHE = "masar-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ───────── التخزين المؤقت ─────────

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put("/", response.clone());
    return response;
  } catch {
    return (await caches.match("/")) || Response.error();
  }
}

// ───────── الإشعارات ─────────

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "مَسار", body: event.data ? event.data.text() : "" };
  }
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-32.png",
    lang: "ar",
    dir: "rtl",
    tag: data.tag || "masar",
    renotify: true,
    data: { url: data.url || "/today", reminderId: data.reminderId || null },
    // أزرار الإجراءات تظهر على Android و Windows؛ iPhone يتجاهلها
    actions: data.reminderId ? [{ action: "snooze", title: "أجّل 30 دقيقة" }] : [],
  };
  event.waitUntil(self.registration.showNotification(data.title || "مَسار", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url, reminderId } = event.notification.data || {};

  if (event.action === "snooze" && reminderId) {
    // الكوكي يُرسل تلقائياً (نفس الموقع)، فالتأجيل يعمل بلا فتح التطبيق
    event.waitUntil(
      fetch(`/api/reminders/${reminderId}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: 30 }),
      }).catch(() => undefined),
    );
    return;
  }

  // افتح التطبيق على الصفحة المناسبة، أو ركّز نافذته إن كانت مفتوحة
  const target = url || "/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.navigate(target).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
