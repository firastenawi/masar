import type { FastifyBaseLogger } from "fastify";
import type { AppDatabase } from "../../db/client";
import { createBackup, latestBackupAge, pruneBackups, type BackupConfig } from "./backup.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * نسخة يومية تلقائية: نفحص كل ساعة إن مرّ يوم على آخر نسخة.
 * الفحص الدوري (بدل موعد ثابت) يعني أن الجهاز لو كان مطفأً وقت الموعد، تُؤخذ النسخة عند تشغيله.
 */
export function startBackupScheduler(db: AppDatabase, config: BackupConfig, log: FastifyBaseLogger): () => void {
  const tick = () => {
    try {
      const age = latestBackupAge(config);
      if (age !== null && age < DAY_MS) return;
      const backup = createBackup(db.$client, config, "daily");
      const removed = pruneBackups(config);
      log.info({ backup: backup.name, removed: removed.length }, "daily backup created");
    } catch (error) {
      log.error(error, "daily backup failed");
    }
  };
  tick();
  const timer = setInterval(tick, CHECK_EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}
