import { useQuery } from "@tanstack/react-query";
import {
  idResponseSchema,
  sessionListSchema,
  type SessionCreateInput,
  type SessionUpdateInput,
} from "@masar/shared";
import { apiGet, apiSend } from "../../lib/api";

export interface SessionFilters {
  pathId?: string;
  reviewOnly?: boolean;
}

export function useSessions(filters: SessionFilters) {
  const params = new URLSearchParams();
  if (filters.pathId) params.set("pathId", filters.pathId);
  if (filters.reviewOnly) params.set("reviewOnly", "true");
  const query = params.toString();
  return useQuery({
    queryKey: ["sessions", filters],
    queryFn: () => apiGet(`/api/sessions${query ? `?${query}` : ""}`, sessionListSchema),
  });
}

export const sessionsApi = {
  create: (body: SessionCreateInput) => apiSend("POST", "/api/sessions", body, idResponseSchema),
  update: (id: string, body: SessionUpdateInput) => apiSend("PATCH", `/api/sessions/${id}`, body, idResponseSchema),
  archive: (id: string) => apiSend("DELETE", `/api/sessions/${id}`),
};
