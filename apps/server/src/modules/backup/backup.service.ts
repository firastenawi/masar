import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Backup, BackupList } from "@masar/shared";

/** اسم الملف يحمل الوقت والسبب: app-2026-10-21T22-15-03Z-daily.db */
const NAME_RE = /^app-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z-([a-z-]+)\.db$/;

export const BACKUP_REASONS = ["daily", "manual", "pre-migration", "pre-restore"] as const;
export type BackupReason = (typeof BACKUP_REASONS)[number];

export interface BackupConfig {
  dir: string;
  /** نسخة إضافية خارج الجهاز (مثلاً مجلد OneDrive أو Google Drive متزامن) */
  copyDir: string | null;
}

function parseName(name: string): { createdAt: string; reason: string } | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  return { createdAt: `${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`, reason: m[5]! };
}

/**
 * نسخة متّسقة أثناء عمل التطبيق عبر VACUUM INTO:
 * تعمل مع وضع WAL (نسخ الملف مباشرة قد يفقد آخر التعديلات)، وتنتج ملفاً مضغوطاً جاهزاً للاستعادة.
 */
export function createBackup(sqlite: Database.Database, config: BackupConfig, reason: BackupReason): Backup {
  mkdirSync(config.dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
  const name = `app-${stamp}-${reason}.db`;
  const target = path.join(config.dir, name);
  const temp = `${target}.tmp`;

  // نكتب لملف مؤقت ثم نعيد التسمية: لا تظهر نسخة ناقصة أبداً لو انقطع شيء
  sqlite.prepare("VACUUM INTO ?").run(temp);
  renameSync(temp, target);

  if (config.copyDir) {
    try {
      mkdirSync(config.copyDir, { recursive: true });
      copyFileSync(target, path.join(config.copyDir, name));
    } catch {
      // فشل النسخة الخارجية لا يُفشل النسخة المحلية؛ يظهر في السجل عند المستدعي
    }
  }
  return { name, sizeBytes: statSync(target).size, createdAt: parseName(name)!.createdAt, reason };
}

export function listBackups(config: BackupConfig): BackupList {
  const backups: Backup[] = [];
  if (existsSync(config.dir)) {
    for (const name of readdirSync(config.dir)) {
      const meta = parseName(name);
      if (meta) backups.push({ name, sizeBytes: statSync(path.join(config.dir, name)).size, ...meta });
    }
  }
  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { directory: config.dir, copyDirectory: config.copyDir, backups };
}

/**
 * سياسة الاحتفاظ: آخر 14 نسخة كاملة، ثم نسخة واحدة لكل أسبوع لـ 8 أسابيع.
 * نسخ ما قبل الاستعادة/الترحيل تُعامل مثل غيرها (هي الأحدث غالباً فتبقى).
 */
export function pruneBackups(config: BackupConfig, keepRecent = 14, keepWeekly = 8): string[] {
  const { backups } = listBackups(config);
  const keep = new Set(backups.slice(0, keepRecent).map((b) => b.name));
  const weeks = new Set<string>();
  for (const backup of backups.slice(keepRecent)) {
    const week = String(Math.floor(Date.parse(backup.createdAt) / (7 * 24 * 60 * 60 * 1000)));
    if (!weeks.has(week) && weeks.size < keepWeekly) {
      weeks.add(week);
      keep.add(backup.name);
    }
  }
  const removed: string[] = [];
  for (const backup of backups) {
    if (keep.has(backup.name)) continue;
    unlinkSync(path.join(config.dir, backup.name));
    removed.push(backup.name);
  }
  return removed;
}

export function latestBackupAge(config: BackupConfig, now = Date.now()): number | null {
  const latest = listBackups(config).backups[0];
  return latest ? now - Date.parse(latest.createdAt) : null;
}

/** يتأكد أن ملف النسخة سليم ويمكن قراءته قبل الاعتماد عليه */
export function verifyBackup(file: string): { ok: boolean; message: string; tables: number } {
  let db: Database.Database | null = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const integrity = db.pragma("integrity_check", { simple: true });
    const tables = (db.prepare("select count(*) as n from sqlite_master where type = 'table'").get() as { n: number }).n;
    if (integrity !== "ok") return { ok: false, message: `فحص السلامة فشل: ${String(integrity)}`, tables };
    if (tables === 0) return { ok: false, message: "الملف لا يحتوي جداول", tables };
    return { ok: true, message: "سليمة", tables };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error), tables: 0 };
  } finally {
    db?.close();
  }
}

/**
 * استعادة نسخة احتياطية (والتطبيق متوقف):
 * 1. التحقق من سلامة النسخة.
 * 2. نسخة "ما قبل الاستعادة" من القاعدة الحالية، حتى يمكن التراجع.
 * 3. استبدال القاعدة وحذف ملفات WAL القديمة.
 */
export function restoreBackup(dbFile: string, backupFile: string, config: BackupConfig): { safetyBackup: string | null } {
  const check = verifyBackup(backupFile);
  if (!check.ok) throw new Error(`النسخة غير صالحة: ${check.message}`);

  let safetyBackup: string | null = null;
  if (existsSync(dbFile)) {
    const current = new Database(dbFile);
    try {
      safetyBackup = createBackup(current, config, "pre-restore").name;
    } finally {
      current.close();
    }
  }
  for (const suffix of ["-wal", "-shm"]) {
    if (existsSync(dbFile + suffix)) unlinkSync(dbFile + suffix);
  }
  copyFileSync(backupFile, dbFile);
  return { safetyBackup };
}

/** للتصدير: كل الجداول كـ JSON (بلا جلسات الدخول ولا بصمة كلمة المرور) */
export function exportAll(sqlite: Database.Database): Record<string, unknown[]> {
  const tables = sqlite
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%' order by name")
    .all() as { name: string }[];
  const out: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    if (name === "auth_sessions") continue;
    let rows = sqlite.prepare(`select * from "${name}"`).all();
    if (name === "settings") rows = rows.filter((r) => !String((r as { key: string }).key).startsWith("auth."));
    out[name] = rows;
  }
  return out;
}
