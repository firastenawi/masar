import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  changeLogListSchema,
  idResponseSchema,
  pathCreateSchema,
  pathDetailSchema,
  pathListSchema,
  pathUpdateSchema,
  reorderSchema,
  skillCreateSchema,
  skillUpdateSchema,
  stageCreateSchema,
  stageUpdateSchema,
  taskCreateSchema,
  taskPostponeSchema,
  taskUpdateSchema,
} from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { today } from "../settings/settings.service";
import * as commands from "./roadmap.commands";
import * as queries from "./roadmap.queries";

const pathParams = z.object({ pathId: z.string().min(1) });
const stageParams = z.object({ stageId: z.string().min(1) });
const taskParams = z.object({ taskId: z.string().min(1) });
const skillParams = z.object({ skillId: z.string().min(1) });
const noContent = { 204: z.null() };

export const roadmapRoutes: FastifyPluginAsyncZod<{ db: AppDatabase }> = async (app, { db }) => {
  // ───────── المسارات ─────────

  app.get("/api/paths", { schema: { response: { 200: pathListSchema } } }, async () =>
    queries.listPaths(db, today(db)),
  );

  app.post(
    "/api/paths",
    { schema: { body: pathCreateSchema, response: { 201: idResponseSchema } } },
    async (req, reply) => reply.status(201).send({ id: commands.createPath(db, req.body).id }),
  );

  app.get(
    "/api/paths/:pathId",
    { schema: { params: pathParams, response: { 200: pathDetailSchema } } },
    async (req) => queries.getPathDetail(db, req.params.pathId, today(db)),
  );

  app.patch(
    "/api/paths/:pathId",
    { schema: { params: pathParams, body: pathUpdateSchema, response: { 200: idResponseSchema } } },
    async (req) => ({ id: commands.updatePath(db, req.params.pathId, req.body).id }),
  );

  app.delete("/api/paths/:pathId", { schema: { params: pathParams, response: noContent } }, async (req, reply) => {
    commands.archivePath(db, req.params.pathId);
    return reply.status(204).send(null);
  });

  app.get(
    "/api/paths/:pathId/history",
    { schema: { params: pathParams, response: { 200: changeLogListSchema } } },
    async (req) => queries.getPathHistory(db, req.params.pathId),
  );

  // ───────── المهارات ─────────

  app.post(
    "/api/paths/:pathId/skills",
    { schema: { params: pathParams, body: skillCreateSchema, response: { 201: idResponseSchema } } },
    async (req, reply) => reply.status(201).send({ id: commands.createSkill(db, req.params.pathId, req.body).id }),
  );

  app.patch(
    "/api/skills/:skillId",
    { schema: { params: skillParams, body: skillUpdateSchema, response: { 200: idResponseSchema } } },
    async (req) => ({ id: commands.updateSkill(db, req.params.skillId, req.body).id }),
  );

  app.delete("/api/skills/:skillId", { schema: { params: skillParams, response: noContent } }, async (req, reply) => {
    commands.archiveSkill(db, req.params.skillId);
    return reply.status(204).send(null);
  });

  // ───────── المراحل ─────────

  app.post(
    "/api/paths/:pathId/stages",
    { schema: { params: pathParams, body: stageCreateSchema, response: { 201: idResponseSchema } } },
    async (req, reply) => reply.status(201).send({ id: commands.createStage(db, req.params.pathId, req.body).id }),
  );

  app.put(
    "/api/paths/:pathId/stages/order",
    { schema: { params: pathParams, body: reorderSchema, response: noContent } },
    async (req, reply) => {
      commands.reorderStages(db, req.params.pathId, req.body.ids);
      return reply.status(204).send(null);
    },
  );

  app.patch(
    "/api/stages/:stageId",
    { schema: { params: stageParams, body: stageUpdateSchema, response: { 200: idResponseSchema } } },
    async (req) => ({ id: commands.updateStage(db, req.params.stageId, req.body).id }),
  );

  app.delete("/api/stages/:stageId", { schema: { params: stageParams, response: noContent } }, async (req, reply) => {
    commands.archiveStage(db, req.params.stageId);
    return reply.status(204).send(null);
  });

  // ───────── المهام ─────────

  app.post(
    "/api/stages/:stageId/tasks",
    { schema: { params: stageParams, body: taskCreateSchema, response: { 201: idResponseSchema } } },
    async (req, reply) => reply.status(201).send({ id: commands.createTask(db, req.params.stageId, req.body).id }),
  );

  app.put(
    "/api/stages/:stageId/tasks/order",
    { schema: { params: stageParams, body: reorderSchema, response: noContent } },
    async (req, reply) => {
      commands.reorderTasks(db, req.params.stageId, req.body.ids);
      return reply.status(204).send(null);
    },
  );

  app.patch(
    "/api/tasks/:taskId",
    { schema: { params: taskParams, body: taskUpdateSchema, response: { 200: idResponseSchema } } },
    async (req) => ({ id: commands.updateTask(db, req.params.taskId, req.body).id }),
  );

  app.post(
    "/api/tasks/:taskId/postpone",
    { schema: { params: taskParams, body: taskPostponeSchema, response: { 200: idResponseSchema } } },
    async (req) => ({ id: commands.postponeTask(db, req.params.taskId, req.body).id }),
  );

  app.delete("/api/tasks/:taskId", { schema: { params: taskParams, response: noContent } }, async (req, reply) => {
    commands.archiveTask(db, req.params.taskId);
    return reply.status(204).send(null);
  });
};
