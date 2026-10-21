import { isOverdue } from "./dates";
import type { Suggestion, SuggestionReason, TaskWithContext } from "./schemas/sessions";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export interface SuggestionCandidate extends TaskWithContext {
  /** ترتيب المسار والمرحلة، لاختيار "المهمة التالية" بترتيب الخطة */
  pathSortOrder: number;
  stageSortOrder: number;
}

const byPlanOrder = (a: SuggestionCandidate, b: SuggestionCandidate) =>
  a.pathSortOrder - b.pathSortOrder || a.stageSortOrder - b.stageSortOrder || a.sortOrder - b.sortOrder;

const byDueThenPriority = (a: SuggestionCandidate, b: SuggestionCandidate) =>
  (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
  byPlanOrder(a, b);

/**
 * اقتراح "الخطوة التالية" بقواعد واضحة وبلا ذكاء اصطناعي:
 * 1. أكمل ما بدأته (قيد التنفيذ، الأحدث تعديلاً أولاً)
 * 2. المتأخر (الأقدم موعداً، ثم الأعلى أولوية)
 * 3. المستحق اليوم
 * 4. الأولوية العالية التي لم تبدأ
 * 5. أول مهمة لم تبدأ بترتيب الخطة
 *
 * المهام المكتملة، والمؤجلة إلى موعد لم يحن بعد، مستبعدة.
 */
export function suggestNextTask(candidates: readonly SuggestionCandidate[], today: string): Suggestion | null {
  const open = candidates.filter(
    (t) => t.status !== "done" && !(t.status === "postponed" && t.dueDate !== null && t.dueDate > today),
  );

  const pick = (reason: SuggestionReason, list: SuggestionCandidate[]): Suggestion | null => {
    const task = list[0];
    if (!task) return null;
    const { pathSortOrder: _p, stageSortOrder: _s, ...rest } = task;
    return { task: rest, reason };
  };

  return (
    pick(
      "in_progress",
      open.filter((t) => t.status === "in_progress").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    ) ??
    pick("overdue", open.filter((t) => isOverdue(t, today)).sort(byDueThenPriority)) ??
    pick("due_today", open.filter((t) => t.dueDate === today).sort(byDueThenPriority)) ??
    pick(
      "high_priority",
      open.filter((t) => t.priority === "high" && t.status === "not_started").sort(byDueThenPriority),
    ) ??
    pick("next_in_path", open.filter((t) => t.status === "not_started").sort(byPlanOrder))
  );
}
