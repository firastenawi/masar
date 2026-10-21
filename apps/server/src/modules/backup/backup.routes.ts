import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { backupListSchema, backupSchema } from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { today } from "../settings/settings.service";
import { createBackup, exportAll, listBackups, pruneBackups, type BackupConfig } from "./backup.service";

export const backupRoutes: FastifyPluginAsyncZod<{ db: AppDatabase; backup: BackupConfig }> = async (app, { db, backup }) => {
  app.get("/api/backups", { schema: { response: { 200: backupListSchema } } }, async () => listBackups(backup));

  app.post("/api/backups", { schema: { response: { 201: backupSchema } } }, async (_req, reply) => {
    const created = createBackup(db.$client, backup, "manual");
    pruneBackups(backup);
    return reply.status(201).send(created);
  });

  // تصدير كامل بصيغة JSON يُحمَّل كملف: نسخة مقروءة ومستقلة عن SQLite
  app.get("/api/export", async (_req, reply) => {
    const stamp = today(db); // تاريخ المستخدم المحلي، لا UTC
    const payload = { app: "masar", exportedAt: new Date().toISOString(), tables: exportAll(db.$client) };
    return reply
      .header("content-type", "application/json; charset=utf-8")
      .header("content-disposition", `attachment; filename="masar-export-${stamp}.json"`)
      .send(JSON.stringify(payload, null, 2));
  });
};
