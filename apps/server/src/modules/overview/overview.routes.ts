import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { dashboardResponseSchema, todayResponseSchema } from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { getDashboard, getToday } from "./overview.queries";

export const overviewRoutes: FastifyPluginAsyncZod<{ db: AppDatabase }> = async (app, { db }) => {
  app.get("/api/today", { schema: { response: { 200: todayResponseSchema } } }, async () => getToday(db));
  app.get("/api/dashboard", { schema: { response: { 200: dashboardResponseSchema } } }, async () => getDashboard(db));
};
