import { and, desc, isNull } from "drizzle-orm";
import { addDays, formatMinutes } from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { studySessions } from "../../db/schema";
import { getDashboard } from "../overview/overview.queries";
import { getPathDetail } from "../roadmap/roadmap.queries";

const STATUS = { not_started: "لم تبدأ", in_progress: "قيد التنفيذ", done: "مكتملة", postponed: "مؤجلة" } as const;

/**
 * سياق مختصر عن المستخدم يُرسل مع كل سؤال، بدل قاعدة البيانات كاملة:
 * المسارات وتقدّمها، والمسار الحالي بالتفصيل (مع المعرّفات حتى يستطيع المساعد اقتراح تعديلات عليها)،
 * وآخر جلسات التعلم.
 */
export function buildContext(db: AppDatabase, pathId: string | null): string {
  const dashboard = getDashboard(db);
  const lines: string[] = [];

  lines.push(`# بيانات المستخدم (اليوم: ${dashboard.today})`);
  lines.push(
    `- السلسلة: ${dashboard.streak.current} يوم (الأطول ${dashboard.streak.longest})` +
      ` · تعلّم آخر 7 أيام: ${formatMinutes(dashboard.minutesLast7Days)}` +
      ` · مهام أُنجزت آخر 7 أيام: ${dashboard.tasksDoneLast7Days} · متأخرة: ${dashboard.overdueCount}`,
  );

  lines.push("", "## المسارات");
  if (dashboard.paths.length === 0) lines.push("- لا توجد مسارات بعد.");
  for (const p of dashboard.paths) {
    lines.push(
      `- [path:${p.id}] ${p.title} — ${p.progress.percent}% (${p.progress.doneCount}/${p.progress.taskCount} مهام)` +
        ` · المستوى ${p.currentLevel}←${p.targetLevel}` +
        (p.targetDate ? ` · الموعد المستهدف ${p.targetDate}` : "") +
        (p.status !== "active" ? ` · الحالة: ${p.status}` : "") +
        (p.goal ? ` · الهدف: ${p.goal}` : ""),
    );
  }

  if (pathId) {
    const path = getPathDetail(db, pathId, dashboard.today);
    lines.push("", `## تفاصيل المسار الحالي: ${path.title}`);
    if (path.description) lines.push(path.description);
    if (path.skills.length) lines.push(`المهارات المستهدفة: ${path.skills.map((s) => `${s.name} (${s.targetLevel}/5)`).join("، ")}`);
    for (const stage of path.stages) {
      lines.push(`### [stage:${stage.id}] ${stage.title} — ${stage.progress.percent}%${stage.targetDate ? ` · حتى ${stage.targetDate}` : ""}`);
      for (const t of stage.tasks) {
        lines.push(
          `- [task:${t.id}] ${t.title} · ${STATUS[t.status]} · ${t.type} · أولوية ${t.priority}` +
            (t.dueDate ? ` · موعد ${t.dueDate}${t.isOverdue ? " (متأخرة)" : ""}` : "") +
            (t.estimateMinutes ? ` · متوقع ${t.estimateMinutes}د` : "") +
            (t.actualMinutes ? ` · فعلي ${t.actualMinutes}د` : ""),
        );
      }
    }
  }

  const since = addDays(dashboard.today, -14);
  const sessions = db
    .select()
    .from(studySessions)
    .where(and(isNull(studySessions.archivedAt)))
    .orderBy(desc(studySessions.startedAt))
    .limit(8)
    .all()
    .filter((s) => s.localDate >= since);
  lines.push("", "## آخر جلسات التعلم (14 يوماً)");
  if (sessions.length === 0) lines.push("- لا توجد جلسات حديثة.");
  for (const s of sessions) {
    const parts = [
      s.topics && `درس: ${s.topics}`,
      s.problems && `مشكلة: ${s.problems}`,
      s.reviewLater && `للمراجعة: ${s.reviewLater}`,
    ].filter(Boolean);
    lines.push(`- ${s.localDate} · ${s.durationMinutes}د${parts.length ? " · " + parts.join(" · ") : ""}`);
  }

  return lines.join("\n");
}
