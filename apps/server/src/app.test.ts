import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { healthResponseSchema } from "@masar/shared";
import { buildApp } from "./app";
import { openDatabase, type AppDatabase } from "./db/client";

describe("API", () => {
  let db: AppDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    db = openDatabase(":memory:");
    app = buildApp({ db });
  });

  afterEach(async () => {
    await app.close();
    db.$client.close();
  });

  it("GET /api/health يرجع حالة سليمة", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(healthResponseSchema.parse(res.json()).status).toBe("ok");
  });

  it("يرجع 503 إذا كانت قاعدة البيانات مغلقة", async () => {
    db.$client.close();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: "DATABASE_UNAVAILABLE" });
    db = openDatabase(":memory:"); // حتى يغلقه afterEach دون خطأ
  });

  it("يرجع 404 بصيغة خطأ موحّدة للمسارات غير الموجودة", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: "NOT_FOUND", message: "المسار المطلوب غير موجود" });
  });

  it("الـ migrations تُنشئ جدول الإعدادات", () => {
    const row = db.$client
      .prepare("select name from sqlite_master where type = 'table' and name = 'settings'")
      .get();
    expect(row).toEqual({ name: "settings" });
  });
});
