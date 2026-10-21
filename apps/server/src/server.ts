import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { buildApp } from "./app";
import { loadEnv, REPO_ROOT } from "./config/env";
import { openDatabase } from "./db/client";
import { ClaudeCodeProvider } from "./modules/ai/claude-code.provider";
import { FakeProvider } from "./modules/ai/fake.provider";
import { pruneExpiredSessions } from "./modules/auth/auth.service";
import { startBackupScheduler } from "./modules/backup/backup.scheduler";
import { createBackup, type BackupConfig } from "./modules/backup/backup.service";
import { startReminderEngine } from "./modules/notifications/notifications.routes";
import { ensureDefaultReminders } from "./modules/notifications/notifications.service";
import { loadOrCreateVapidKeys, WebPushSender } from "./modules/notifications/push";

const env = loadEnv();
/** `npm start` يمرّر --production: يخدم الواجهة المبنية من نفس المنفذ */
const production = process.argv.includes("--production");

mkdirSync(env.DATA_DIR, { recursive: true });
const backup: BackupConfig = { dir: path.join(env.DATA_DIR, "backups"), copyDir: env.BACKUP_COPY_DIR ?? null };

let preMigrationBackup: string | null = null;
const db = openDatabase(path.join(env.DATA_DIR, "app.db"), {
  // تحديث يغيّر شكل القاعدة؟ نأخذ نسخة قبله دائماً
  beforeMigrate: (sqlite) => {
    preMigrationBackup = createBackup(sqlite, backup, "pre-migration").name;
  },
});

const provider =
  env.AI_PROVIDER === "fake"
    ? new FakeProvider()
    : new ClaudeCodeProvider({
        bin: env.CLAUDE_BIN,
        model: env.AI_MODEL,
        workDir: path.join(env.DATA_DIR, "ai-workdir"),
        timeoutMs: env.AI_TIMEOUT_MS,
      });

const webDist = path.join(REPO_ROOT, "apps", "web", "dist");
if (production && !existsSync(path.join(webDist, "index.html"))) {
  console.error("الواجهة غير مبنية. شغّل أولاً: npm run build");
  process.exit(1);
}

const push = new WebPushSender(loadOrCreateVapidKeys(db), env.VAPID_SUBJECT);
ensureDefaultReminders(db);

const app = buildApp({
  db,
  logger: { level: env.LOG_LEVEL },
  ai: { provider, dailyLimit: env.AI_DAILY_LIMIT },
  requireAuth: true,
  backup,
  webDist: production ? webDist : null,
  push,
});

const stopBackups = startBackupScheduler(db, backup, app.log);
const stopReminders = startReminderEngine(db, push, app.log);
pruneExpiredSessions(db);

async function shutdown(signal: string) {
  app.log.info(`received ${signal}, shutting down`);
  stopBackups();
  stopReminders();
  await app.close();
  db.$client.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  if (preMigrationBackup) app.log.info(`pre-migration backup: ${preMigrationBackup}`);
  app.log.info(`AI provider: ${provider.name}${provider.model ? ` (${provider.model})` : ""}`);
  if (production) app.log.info(`مَسار يعمل على http://${env.API_HOST}:${env.API_PORT}`);
} catch (error) {
  app.log.fatal(error);
  process.exit(1);
}
