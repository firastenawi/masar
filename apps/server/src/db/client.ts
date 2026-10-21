import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "migrations");

/** عدد الـ migrations التي لم تُطبَّق بعد على هذه القاعدة */
export function pendingMigrationCount(sqlite: Database.Database): number {
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as {
    entries: unknown[];
  };
  const hasTable = sqlite
    .prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
    .get();
  const applied = hasTable
    ? (sqlite.prepare("select count(*) as n from __drizzle_migrations").get() as { n: number }).n
    : 0;
  return Math.max(0, journal.entries.length - applied);
}

export interface OpenOptions {
  /** يُستدعى قبل تطبيق migrations جديدة على قاعدة موجودة (لأخذ نسخة احتياطية) */
  beforeMigrate?: (sqlite: Database.Database, pending: number) => void;
}

/**
 * يفتح قاعدة البيانات ويطبّق الإعدادات الآمنة ثم يشغّل الـ migrations.
 * استخدم ":memory:" في الاختبارات.
 */
export function openDatabase(filePath: string, options: OpenOptions = {}): AppDatabase {
  const sqlite = new Database(filePath);

  // WAL: كتابة أكثر أماناً عند الانقطاع، وقراءة متزامنة مع الكتابة
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");

  const pending = pendingMigrationCount(sqlite);
  const isExisting = sqlite.prepare("select count(*) as n from sqlite_master").get() as { n: number };
  if (pending > 0 && isExisting.n > 0) options.beforeMigrate?.(sqlite, pending);

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}
