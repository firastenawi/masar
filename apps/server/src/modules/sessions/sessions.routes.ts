import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  idResponseSchema,
  sessionCreateSchema,
  sessionListQuerySchema,
  sessionListSchema,
  sessionUpdateSchema,
} from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { archiveSession, createSession, listSessions, updateSession } from "./sessions.service";

const params = z.object({ sessionId: z.string().min(1) });

export const sessionsRoutes: FastifyPluginAsyncZod<{ db: AppDatabase }> = async (app, { db }) => {
  app.get(
    "/api/sessions",
    { schema: { querystring: sessionListQuerySchema, response: { 200: sessionListSchema } } },
    async (req) => listSessions(db, req.query),
  );

  app.post(
    "/api/sessions",
    { schema: { body: sessionCreateSchema, response: { 201: idResponseSchema } } },
    async (req, reply) => reply.status(201).send({ id: createSession(db, req.body).id }),
  );

  app.patch(
    "/api/sessions/:sessionId",
    { schema: { params, body: sessionUpdateSchema, response: { 200: idResponseSchema } } },
    async (req) => ({ id: updateSession(db, req.params.sessionId, req.body).id }),
  );

  app.delete("/api/sessions/:sessionId", { schema: { params, response: { 204: z.null() } } }, async (req, reply) => {
    archiveSession(db, req.params.sessionId);
    return reply.status(204).send(null);
  });
};
