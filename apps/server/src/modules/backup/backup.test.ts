import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupListSchema } from "@masar/shared";
import { buildApp } from "../../app";
import { openDatabase, type AppDatabase } from "../../db/client";
import { createBackup, exportAll, listBackups, pruneBackups, restoreBackup, verifyBackup, type BackupConfig } from "./backup.service";

let dir: string;
let config: BackupConfig;
let db: AppDatabase;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "masar-backup-"));
  config = { dir: path.join(dir, "backups"), copyDir: path.join(dir, "cloud") };
  db = openDatabase(path.join(dir, "app.db"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

const countPaths = (file: string) => {
  const d = new Database(file, { readonly: true });
  const n = (d.prepare("select count(*) as n from learning_paths").get() as { n: number }).n;
  d.close();
  return n;
};

describe("النسخ الاحتياطي", () => {
  it("ينشئ نسخة متّسقة سليمة ونسخة خارجية", async () => {
    const app = buildApp({ db, backup: config });
    await app.inject({ method: "POST", url: "/api/paths", payload: { title: "DevOps" } });

    const res = await app.inject({ method: "POST", url: "/api/backups" });
    expect(res.statusCode).toBe(201);
    const list = backupListSchema.parse((await app.inject({ method: "GET", url: "/api/backups" })).json());
    expect(list.backups).toHaveLength(1);
    expect(list.backups[0]!.reason).toBe("manual");

    const file = path.join(config.dir, list.backups[0]!.name);
    expect(verifyBackup(file)).toMatchObject({ ok: true });
    expect(countPaths(file)).toBe(1); // يشمل التعديلات الموجودة في WAL
    expect(readdirSync(config.copyDir!)).toEqual([list.backups[0]!.name]);
    await app.close();
  });

  it("الاستعادة الفعلية: ترجع البيانات وتحفظ نسخة من الحالة السابقة", async () => {
    const app = buildApp({ db, backup: config });
    await app.inject({ method: "POST", url: "/api/paths", payload: { title: "قبل" } });
    const backup = createBackup(db.$client, config, "manual");
    await app.inject({ method: "POST", url: "/api/paths", payload: { title: "بعد" } });
    await app.close();
    db.$client.close();

    const dbFile = path.join(dir, "app.db");
    const { safetyBackup } = restoreBackup(dbFile, path.join(config.dir, backup.name), config);
    expect(countPaths(dbFile)).toBe(1);
    expect(safetyBackup).toMatch(/pre-restore/);
    expect(countPaths(path.join(config.dir, safetyBackup!))).toBe(2);

    db = openDatabase(dbFile); // للتنظيف في afterEach
  });

  it("يرفض استعادة ملف تالف دون لمس القاعدة الحالية", () => {
    const bad = path.join(dir, "bad.db");
    writeFileSync(bad, "ليس قاعدة بيانات");
    expect(verifyBackup(bad).ok).toBe(false);
    expect(() => restoreBackup(path.join(dir, "app.db"), bad, config)).toThrow(/غير صالحة/);
  });

  it("سياسة الاحتفاظ: 14 أحدث + نسخة أسبوعية", () => {
    mkdirSync(config.dir, { recursive: true });
    const day = 24 * 60 * 60 * 1000;
    const start = Date.parse("2026-01-01T03:00:00Z");
    for (let i = 0; i < 60; i++) {
      const stamp = new Date(start + i * day).toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
      writeFileSync(path.join(config.dir, `app-${stamp}-daily.db`), "x");
    }
    pruneBackups(config);
    const left = listBackups(config).backups;
    expect(left.length).toBeLessThanOrEqual(14 + 8);
    expect(left.length).toBeGreaterThan(14);
    expect(left[0]!.createdAt).toBe("2026-03-01T03:00:00Z"); // الأحدث باقٍ
  });

  it("التصدير لا يحتوي بصمة كلمة المرور ولا الجلسات", async () => {
    const app = buildApp({ db, backup: config, requireAuth: true });
    const setup = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { password: "password-123456" } });
    const cookie = String(setup.headers["set-cookie"]).split(";")[0]!;
    const res = await app.inject({ method: "GET", url: "/api/export", headers: { cookie } });
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.body).not.toContain("scrypt$");
    expect(Object.keys(res.json().tables)).not.toContain("auth_sessions");
    expect(exportAll(db.$client)).toHaveProperty("learning_paths");
    await app.close();
  });
});

describe("نسخة قبل الترحيل", () => {
  it("تُؤخذ عند فتح قاعدة موجودة فيها migrations ناقصة", () => {
    db.$client.close();
    const file = path.join(dir, "app.db");
    // نحاكي قاعدة من إصدار أقدم: نحذف جداول آخر migration وسجلّه (أياً كان آخر migration)
    const migrations = path.join(import.meta.dirname, "..", "..", "db", "migrations");
    const journal = JSON.parse(readFileSync(path.join(migrations, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
    const lastSql = readFileSync(path.join(migrations, `${journal.entries.at(-1)!.tag}.sql`), "utf8");
    const lastTables = [...lastSql.matchAll(/CREATE TABLE `(\w+)`/g)].map((m) => m[1]!);
    expect(lastTables.length).toBeGreaterThan(0);

    const raw = new Database(file);
    for (const table of lastTables) raw.prepare(`drop table "${table}"`).run();
    raw.prepare("delete from __drizzle_migrations where rowid = (select max(rowid) from __drizzle_migrations)").run();
    raw.close();

    const pending: number[] = [];
    db = openDatabase(file, { beforeMigrate: (_sqlite, n) => void pending.push(n) });
    expect(pending).toEqual([1]);
    // والترحيل طُبّق بعدها
    expect(db.$client.prepare("select 1 from sqlite_master where name = ?").get(lastTables[0])).toBeTruthy();
  });

  it("لا تُؤخذ لقاعدة جديدة فارغة", () => {
    let called = 0;
    const fresh = openDatabase(path.join(dir, "fresh.db"), { beforeMigrate: () => void called++ });
    fresh.$client.close();
    expect(called).toBe(0);
  });
});
