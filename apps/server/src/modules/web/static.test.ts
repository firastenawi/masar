import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app";
import { openDatabase } from "../../db/client";

let dir: string;
let app: ReturnType<typeof buildApp>;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "masar-web-"));
  const dist = path.join(dir, "dist");
  mkdirSync(path.join(dist, "assets"), { recursive: true });
  writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>مسار</title>");
  writeFileSync(path.join(dist, "assets", "app-abc123.js"), "console.log(1)");
  writeFileSync(path.join(dir, "secret.txt"), "لا يجب أن يُقرأ");
  app = buildApp({ db: openDatabase(":memory:"), webDist: dist, requireAuth: true });
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("خدمة الواجهة المبنية", () => {
  it("يخدم index.html بلا تخزين مؤقت، والملفات ذات البصمة لسنة", async () => {
    const index = await app.inject({ method: "GET", url: "/" });
    expect(index.statusCode).toBe(200);
    expect(index.headers["content-type"]).toMatch(/text\/html/);
    expect(index.headers["cache-control"]).toBe("no-cache");

    const asset = await app.inject({ method: "GET", url: "/assets/app-abc123.js" });
    expect(asset.body).toBe("console.log(1)");
    expect(asset.headers["cache-control"]).toMatch(/immutable/);
  });

  it("مسارات الواجهة ترجع index.html (توجيه React)", async () => {
    const res = await app.inject({ method: "GET", url: "/paths/123" });
    expect(res.body).toContain("<title>مسار</title>");
  });

  it("الواجهة عامة لكن البيانات محمية، ومسار API غير موجود يرجع JSON", async () => {
    expect((await app.inject({ method: "GET", url: "/today" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/paths" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
  });

  it("يمنع الخروج من مجلد الواجهة", async () => {
    for (const url of ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.body, url).not.toContain("لا يجب");
    }
  });
});
