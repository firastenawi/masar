import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authStatusSchema } from "@masar/shared";
import { buildApp } from "../../app";
import { openDatabase, type AppDatabase } from "../../db/client";
import { FailureLimiter } from "../../lib/rate-limit";
import { hashPassword, verifyPassword } from "./password";

let db: AppDatabase;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  db = openDatabase(":memory:");
  app = buildApp({ db, requireAuth: true });
});

afterEach(async () => {
  await app.close();
  db.$client.close();
});

const PASSWORD = "كلمة-سر-طويلة-123";

type Opts = { cookie?: string; payload?: object; headers?: Record<string, string>; remoteAddress?: string };

async function call(method: "GET" | "POST", url: string, opts: Opts = {}) {
  const res = await app.inject({
    method,
    url,
    remoteAddress: opts.remoteAddress ?? "127.0.0.1",
    headers: { ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers },
    ...(opts.payload ? { payload: opts.payload } : {}),
  });
  const setCookie = res.headers["set-cookie"];
  const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return {
    status: res.statusCode,
    body: res.body ? (res.json() as unknown) : null,
    cookie: cookieHeader?.split(";")[0],
    rawCookie: cookieHeader,
  };
}

async function setup() {
  const res = await call("POST", "/api/auth/setup", { payload: { password: PASSWORD } });
  expect(res.status).toBe(204);
  return res.cookie!;
}

describe("كلمة المرور", () => {
  it("البصمة تختلف كل مرة وتتحقق صحيحاً", async () => {
    const a = await hashPassword("abc-1234567");
    expect(a).not.toBe(await hashPassword("abc-1234567"));
    expect(await verifyPassword("abc-1234567", a)).toBe(true);
    expect(await verifyPassword("abc-1234568", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("الحماية", () => {
  it("كل مسارات البيانات تتطلب تسجيل الدخول، والصحة متاحة", async () => {
    expect((await call("GET", "/api/paths")).status).toBe(401);
    expect((await call("GET", "/api/health")).status).toBe(200);
    const status = authStatusSchema.parse((await call("GET", "/api/auth/status")).body);
    expect(status).toEqual({ configured: false, authenticated: false, setupAllowed: true });
  });

  it("الإعداد الأول يسجّل الدخول بكوكي آمن، ولا يتكرر", async () => {
    const res = await call("POST", "/api/auth/setup", { payload: { password: PASSWORD } });
    expect(res.rawCookie).toMatch(/HttpOnly/);
    expect(res.rawCookie).toMatch(/SameSite=Lax/);
    expect((await call("GET", "/api/paths", { cookie: res.cookie })).status).toBe(200);
    expect((await call("POST", "/api/auth/setup", { payload: { password: PASSWORD } })).status).toBe(409);
  });

  it("الإعداد الأول مرفوض من خارج الجهاز (عبر Tailscale أو الشبكة)", async () => {
    const viaProxy = await call("POST", "/api/auth/setup", {
      payload: { password: PASSWORD },
      headers: { "x-forwarded-for": "100.64.0.5" },
    });
    expect(viaProxy.status).toBe(403);
    const lan = await call("POST", "/api/auth/setup", { payload: { password: PASSWORD }, remoteAddress: "192.168.1.20" });
    expect(lan.status).toBe(403);
  });

  it("يرفض كلمة مرور قصيرة", async () => {
    expect((await call("POST", "/api/auth/setup", { payload: { password: "short" } })).status).toBe(400);
  });

  it("الكوكي Secure عند الوصول عبر https (Tailscale)", async () => {
    await setup();
    const res = await call("POST", "/api/auth/login", {
      payload: { password: PASSWORD },
      headers: { "x-forwarded-proto": "https", "x-forwarded-for": "100.64.0.5" },
    });
    expect(res.rawCookie).toMatch(/Secure/);
  });

  it("تسجيل الدخول والخروج", async () => {
    await setup();
    expect((await call("POST", "/api/auth/login", { payload: { password: "خطأ" } })).body).toMatchObject({
      code: "INVALID_PASSWORD",
    });
    const { cookie } = await call("POST", "/api/auth/login", { payload: { password: PASSWORD } });
    expect((await call("GET", "/api/paths", { cookie })).status).toBe(200);
    await call("POST", "/api/auth/logout", { cookie });
    expect((await call("GET", "/api/paths", { cookie })).status).toBe(401);
  });

  it("يحظر بعد 5 محاولات خاطئة", async () => {
    await setup();
    for (let i = 0; i < 5; i++) await call("POST", "/api/auth/login", { payload: { password: "wrong" } });
    const res = await call("POST", "/api/auth/login", { payload: { password: PASSWORD } });
    expect(res.status).toBe(429);
  });

  it("تغيير كلمة المرور يُخرج الأجهزة الأخرى ويبقي الحالي", async () => {
    const current = await setup();
    const { cookie: other } = await call("POST", "/api/auth/login", { payload: { password: PASSWORD } });
    const res = await call("POST", "/api/auth/password", {
      cookie: current,
      payload: { currentPassword: PASSWORD, newPassword: "كلمة-جديدة-456789" },
    });
    expect(res.status).toBe(204);
    expect((await call("GET", "/api/paths", { cookie: current })).status).toBe(200);
    expect((await call("GET", "/api/paths", { cookie: other })).status).toBe(401);
    expect((await call("POST", "/api/auth/login", { payload: { password: PASSWORD } })).status).toBe(401);
  });

  it("يرفض طلبات التعديل من موقع آخر", async () => {
    const cookie = await setup();
    const res = await call("POST", "/api/paths", {
      cookie,
      payload: { title: "x" },
      headers: { origin: "https://evil.example", host: "localhost:3001" },
    });
    expect(res.status).toBe(403);
    const nullOrigin = await call("POST", "/api/paths", { cookie, payload: { title: "x" }, headers: { origin: "null" } });
    expect(nullOrigin.status).toBe(403);
  });

  it("رمز جلسة مزوّر لا يعمل", async () => {
    await setup();
    expect((await call("GET", "/api/paths", { cookie: "masar_session=fake-token" })).status).toBe(401);
  });
});

describe("FailureLimiter", () => {
  it("يرفع الحظر بعد انتهاء النافذة", () => {
    const limiter = new FailureLimiter(2, 1000);
    limiter.fail("ip", 0);
    limiter.fail("ip", 0);
    expect(limiter.blockedFor("ip", 500)).toBe(1);
    expect(limiter.blockedFor("ip", 1500)).toBe(0);
  });
});
