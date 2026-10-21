import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dashboardResponseSchema,
  todayResponseSchema,
  changeLogListSchema,
  idResponseSchema,
  pathDetailSchema,
  pathListSchema,
  type PathCreateInput,
  type PathUpdateInput,
  type StageCreateInput,
  type TaskCreateInput,
  type TaskUpdateInput,
} from "@masar/shared";
import { apiGet, apiSend } from "../../lib/api";

export const pathKeys = {
  all: ["paths"] as const,
  detail: (id: string) => ["paths", id] as const,
  history: (id: string) => ["paths", id, "history"] as const,
};

export function usePaths() {
  return useQuery({ queryKey: pathKeys.all, queryFn: () => apiGet("/api/paths", pathListSchema) });
}

export function usePath(id: string) {
  return useQuery({
    queryKey: pathKeys.detail(id),
    queryFn: () => apiGet(`/api/paths/${id}`, pathDetailSchema),
    enabled: id !== "", // نماذج تختار المسار اختيارياً تمرّر نصاً فارغاً
  });
}

export function usePathHistory(id: string) {
  return useQuery({
    queryKey: pathKeys.history(id),
    queryFn: () => apiGet(`/api/paths/${id}/history`, changeLogListSchema),
  });
}

export function useToday() {
  return useQuery({ queryKey: ["today"], queryFn: () => apiGet("/api/today", todayResponseSchema) });
}

export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet("/api/dashboard", dashboardResponseSchema) });
}

export const roadmapApi = {
  createPath: (body: PathCreateInput) => apiSend("POST", "/api/paths", body, idResponseSchema),
  updatePath: (id: string, body: PathUpdateInput) => apiSend("PATCH", `/api/paths/${id}`, body, idResponseSchema),
  archivePath: (id: string) => apiSend("DELETE", `/api/paths/${id}`),

  createSkill: (pathId: string, body: { name: string; targetLevel?: number }) =>
    apiSend("POST", `/api/paths/${pathId}/skills`, body, idResponseSchema),
  updateSkill: (id: string, body: { name?: string; targetLevel?: number }) =>
    apiSend("PATCH", `/api/skills/${id}`, body, idResponseSchema),
  archiveSkill: (id: string) => apiSend("DELETE", `/api/skills/${id}`),

  createStage: (pathId: string, body: StageCreateInput) =>
    apiSend("POST", `/api/paths/${pathId}/stages`, body, idResponseSchema),
  updateStage: (id: string, body: Partial<StageCreateInput>) =>
    apiSend("PATCH", `/api/stages/${id}`, body, idResponseSchema),
  archiveStage: (id: string) => apiSend("DELETE", `/api/stages/${id}`),
  reorderStages: (pathId: string, ids: string[]) => apiSend("PUT", `/api/paths/${pathId}/stages/order`, { ids }),

  createTask: (stageId: string, body: TaskCreateInput) =>
    apiSend("POST", `/api/stages/${stageId}/tasks`, body, idResponseSchema),
  updateTask: (id: string, body: TaskUpdateInput) => apiSend("PATCH", `/api/tasks/${id}`, body, idResponseSchema),
  postponeTask: (id: string, body: { until: string; reason?: string | null }) =>
    apiSend("POST", `/api/tasks/${id}/postpone`, body, idResponseSchema),
  archiveTask: (id: string) => apiSend("DELETE", `/api/tasks/${id}`),
  reorderTasks: (stageId: string, ids: string[]) => apiSend("PUT", `/api/stages/${stageId}/tasks/order`, { ids }),
};

/**
 * كل تعديل يحدّث كل البيانات المعروضة: تغيير مهمة يؤثر على المسار وصفحة اليوم ولوحة التحكم معاً.
 * لمستخدم واحد وبيانات صغيرة، هذا أبسط وأضمن من تتبّع كل اعتماد على حدة.
 * التحديث بعد الفشل أيضاً: الخادم قد يحفظ شيئاً رغم الخطأ (سؤال المستخدم، أو اقتراح بحالة "فشل").
 */
export function useRoadmapMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries(),
  });
}

/** يبدّل عنصراً مع جاره في قائمة المعرّفات (للأعلى -1، للأسفل +1) */
export function moveId(ids: readonly string[], id: string, direction: -1 | 1): string[] | null {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
