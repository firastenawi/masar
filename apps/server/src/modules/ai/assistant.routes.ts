import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  aiStatusSchema,
  conversationCreateSchema,
  conversationDetailSchema,
  conversationSummarySchema,
  idResponseSchema,
  sendMessageSchema,
} from "@masar/shared";
import {
  archiveConversation,
  createConversation,
  getConversation,
  listConversations,
  requestsToday,
  sendMessage,
  type AssistantDeps,
} from "./assistant.service";
import { applyProposal, rejectProposal } from "./proposals";

const conversationParams = z.object({ conversationId: z.string().min(1) });
const proposalParams = z.object({ proposalId: z.string().min(1) });

export const assistantRoutes: FastifyPluginAsyncZod<AssistantDeps> = async (app, deps) => {
  const { db, provider, dailyLimit } = deps;

  app.get("/api/ai/status", { schema: { response: { 200: aiStatusSchema } } }, async () => ({
    provider: provider.name,
    model: provider.model,
    requestsToday: requestsToday(db),
    dailyLimit,
  }));

  app.get("/api/ai/conversations", { schema: { response: { 200: z.array(conversationSummarySchema) } } }, async () =>
    listConversations(db),
  );

  app.post(
    "/api/ai/conversations",
    { schema: { body: conversationCreateSchema, response: { 201: idResponseSchema } } },
    async (req, reply) => reply.status(201).send({ id: createConversation(db, req.body.pathId ?? null).id }),
  );

  app.get(
    "/api/ai/conversations/:conversationId",
    { schema: { params: conversationParams, response: { 200: conversationDetailSchema } } },
    async (req) => getConversation(db, req.params.conversationId),
  );

  app.delete(
    "/api/ai/conversations/:conversationId",
    { schema: { params: conversationParams, response: { 204: z.null() } } },
    async (req, reply) => {
      archiveConversation(db, req.params.conversationId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/api/ai/conversations/:conversationId/messages",
    { schema: { params: conversationParams, body: sendMessageSchema, response: { 201: idResponseSchema } } },
    async (req, reply) => {
      const message = await sendMessage(deps, req.params.conversationId, req.body.content);
      return reply.status(201).send({ id: message.id });
    },
  );

  app.post(
    "/api/ai/proposals/:proposalId/apply",
    { schema: { params: proposalParams, response: { 204: z.null() } } },
    async (req, reply) => {
      applyProposal(db, req.params.proposalId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/api/ai/proposals/:proposalId/reject",
    { schema: { params: proposalParams, response: { 204: z.null() } } },
    async (req, reply) => {
      rejectProposal(db, req.params.proposalId);
      return reply.status(204).send(null);
    },
  );
};
