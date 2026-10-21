import type { Progress, TaskStatus } from "./schemas/roadmap";

export interface ProgressItem {
  status: TaskStatus;
  weight: number;
}

/**
 * نسبة الإنجاز الموزونة: مجموع أوزان المهام المكتملة ÷ مجموع أوزان كل المهام.
 *
 * - المهام المؤجلة تبقى في المقام: التأجيل لا يرفع النسبة.
 * - المهام المؤرشفة يجب استبعادها قبل الاستدعاء.
 * - التقريب للأسفل، فلا تظهر 100% إلا عند اكتمال كل المهام فعلاً.
 * - تقدّم المسار يُحسب من مهامه كلها مباشرة، وليس من متوسط نسب المراحل،
 *   حتى لا تتساوى مرحلة فيها مهمتان مع مرحلة فيها ثلاثون مهمة.
 */
export function computeProgress(items: readonly ProgressItem[]): Progress {
  const byStatus: Progress["byStatus"] = { not_started: 0, in_progress: 0, done: 0, postponed: 0 };
  let totalWeight = 0;
  let doneWeight = 0;

  for (const item of items) {
    byStatus[item.status] += 1;
    totalWeight += item.weight;
    if (item.status === "done") doneWeight += item.weight;
  }

  return {
    taskCount: items.length,
    doneCount: byStatus.done,
    percent: totalWeight === 0 ? 0 : Math.floor((doneWeight * 100) / totalWeight),
    byStatus,
  };
}
