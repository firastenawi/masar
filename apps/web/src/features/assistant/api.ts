import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  aiStatusSchema,
  conversationDetailSchema,
  conversationSummarySchema,
  idResponseSchema,
} from "@masar/shared";
import { apiGet, apiSend } from "../../lib/api";

export function useConversations() {
  return useQuery({
    queryKey: ["ai", "conversations"],
    queryFn: () => apiGet("/api/ai/conversations", z.array(conversationSummarySchema)),
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ["ai", "conversations", id],
    queryFn: () => apiGet(`/api/ai/conversations/${id}`, conversationDetailSchema),
    enabled: Boolean(id),
  });
}

export function useAiStatus() {
  return useQuery({ queryKey: ["ai", "status"], queryFn: () => apiGet("/api/ai/status", aiStatusSchema) });
}

export const assistantApi = {
  createConversation: (pathId: string | null) =>
    apiSend("POST", "/api/ai/conversations", { pathId }, idResponseSchema),
  archiveConversation: (id: string) => apiSend("DELETE", `/api/ai/conversations/${id}`),
  send: (conversationId: string, content: string) =>
    apiSend("POST", `/api/ai/conversations/${conversationId}/messages`, { content }, idResponseSchema),
  apply: (proposalId: string) => apiSend("POST", `/api/ai/proposals/${proposalId}/apply`),
  reject: (proposalId: string) => apiSend("POST", `/api/ai/proposals/${proposalId}/reject`),
};
