/**
 * استعادة نسخة احتياطية. أوقف مَسار أولاً، ثم:
 *   npm run restore                       ← يعرض النسخ المتاحة
 *   npm run restore -- <اسم الملف أو مساره>
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../config/env";
import { listBackups, restoreBackup, verifyBackup, type BackupConfig } from "../modules/backup/backup.service";

const env = loadEnv();
const config: BackupConfig = { dir: path.join(env.DATA_DIR, "backups"), copyDir: env.BACKUP_COPY_DIR ?? null };
const dbFile = path.join(env.DATA_DIR, "app.db");
const arg = process.argv[2];

if (!arg) {
  const { backups } = listBackups(config);
  console.log(`النسخ المتاحة في ${config.dir}:`);
  for (const b of backups) console.log(`  ${b.name}  (${(b.sizeBytes / 1024).toFixed(0)} KB)`);
  console.log("\nللاستعادة: npm run restore -- <اسم الملف>");
  process.exit(0);
}

const file = existsSync(arg) ? arg : path.join(config.dir, arg);
if (!existsSync(file)) {
  console.error(`الملف غير موجود: ${file}`);
  process.exit(1);
}

const check = verifyBackup(file);
console.log(`فحص النسخة: ${check.message} (${check.tables} جدول)`);
if (!check.ok) process.exit(1);

try {
  const { safetyBackup } = restoreBackup(dbFile, file, config);
  console.log("✓ تمت الاستعادة.");
  if (safetyBackup) console.log(`القاعدة السابقة محفوظة في: ${safetyBackup} (للتراجع استعدها بنفس الأمر)`);
  console.log("شغّل مَسار من جديد.");
} catch (error) {
  // على Windows يفشل الاستبدال إن كان التطبيق ما زال يعمل ويمسك الملف
  console.error(`فشلت الاستعادة: ${error instanceof Error ? error.message : String(error)}`);
  console.error("تأكد أن مَسار متوقف ثم أعد المحاولة.");
  process.exit(1);
}
