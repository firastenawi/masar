import type { TaskStatus } from "./schemas/roadmap";

/** تاريخ اليوم بصيغة YYYY-MM-DD في المنطقة الزمنية المحددة */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** يضيف أياماً إلى تاريخ بصيغة YYYY-MM-DD (يعمل بتوقيت UTC فلا يتأثر بالتوقيت الصيفي) */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** المهمة متأخرة إذا مرّ موعدها ولم تكتمل (والمؤجلة تُعتبر متأخرة إذا مرّ موعدها الجديد) */
export function isOverdue(task: { dueDate: string | null; status: TaskStatus }, today: string): boolean {
  return task.dueDate !== null && task.status !== "done" && task.dueDate < today;
}
