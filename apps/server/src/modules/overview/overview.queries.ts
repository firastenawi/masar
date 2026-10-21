import { and, gte, isNotNull, isNull, sql } from "drizzle-orm";
import {
  addDays,
  computeStreak,
  suggestNextTask,
  todayIn,
  type DashboardResponse,
  type SuggestionCandidate,
  type TaskWithContext,
  type TodayResponse,
} from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { studySessions, tasks } from "../../db/schema";
import { listPaths, openTaskCandidates } from "../roadmap/roadmap.queries";
import { getTimeZone } from "../settings/settings.service";

const UPCOMING_DAYS = 7;
const WEEK_BUCKETS = 8;

function stripOrder({ pathSortOrder: _p, stageSortOrder: _s, ...task }: SuggestionCandidate): TaskWithContext {
  return task;
}

const byDue = (a: TaskWithContext, b: TaskWithContext) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "");

/** دقائق التعلم لكل يوم (بتوقيت المستخدم) منذ تاريخ معيّن */
function minutesByDay(db: AppDatabase, since: string): Map<string, number> {
  const rows = db
    .select({ day: studySessions.localDate, minutes: sql<number>`sum(${studySessions.durationMinutes})` })
    .from(studySessions)
    .where(and(isNull(studySessions.archivedAt), gte(studySessions.localDate, since)))
    .groupBy(studySessions.localDate)
    .all();
  return new Map(rows.map((r) => [r.day, Number(r.minutes)]));
}

function streakFor(db: AppDatabase, today: string) {
  const days = db
    .selectDistinct({ day: studySessions.localDate })
    .from(studySessions)
    .where(isNull(studySessions.archivedAt))
    .all()
    .map((r) => r.day);
  return computeStreak(days, today);
}

function sumRange(byDay: Map<string, number>, start: string, end: string): number {
  let total = 0;
  for (const [day, minutes] of byDay) if (day >= start && day <= end) total += minutes;
  return total;
}

export function getToday(db: AppDatabase): TodayResponse {
  const today = todayIn(getTimeZone(db));
  const candidates = openTaskCandidates(db, today);
  const tasksWithContext = candidates.map(stripOrder);
  const horizon = addDays(today, UPCOMING_DAYS);

  const overdue = tasksWithContext.filter((t) => t.isOverdue).sort(byDue);
  const dueToday = tasksWithContext.filter((t) => t.dueDate === today);
  const inProgress = tasksWithContext
    .filter((t) => t.status === "in_progress" && !t.isOverdue && t.dueDate !== today)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const upcoming = tasksWithContext
    .filter((t) => t.dueDate !== null && t.dueDate > today && t.dueDate <= horizon && t.status !== "in_progress")
    .sort(byDue);

  return {
    today,
    streak: streakFor(db, today),
    minutesToday: minutesByDay(db, today).get(today) ?? 0,
    suggestion: suggestNextTask(candidates, today),
    overdue,
    dueToday,
    inProgress,
    upcoming,
  };
}

export function getDashboard(db: AppDatabase): DashboardResponse {
  const timeZone = getTimeZone(db);
  const today = todayIn(timeZone);
  const candidates = openTaskCandidates(db, today);

  const firstBucketStart = addDays(today, -(WEEK_BUCKETS * 7 - 1));
  const byDay = minutesByDay(db, firstBucketStart);
  const weeklyMinutes = Array.from({ length: WEEK_BUCKETS }, (_, i) => {
    const end = addDays(today, -7 * (WEEK_BUCKETS - 1 - i));
    const start = addDays(end, -6);
    return { start, end, minutes: sumRange(byDay, start, end) };
  });

  // المهام المكتملة في آخر 7 أيام بتوقيت المستخدم (completedAt مخزّن بتوقيت UTC)
  const weekStart = addDays(today, -6);
  const roughCutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const tasksDoneLast7Days = db
    .select({ completedAt: tasks.completedAt })
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), isNotNull(tasks.completedAt), gte(tasks.completedAt, roughCutoff)))
    .all()
    .filter((r) => todayIn(timeZone, new Date(r.completedAt!)) >= weekStart).length;

  const upcoming = candidates
    .map(stripOrder)
    .filter((t) => t.dueDate !== null && t.dueDate >= today)
    .sort(byDue)
    .slice(0, 5);

  return {
    today,
    streak: streakFor(db, today),
    minutesToday: byDay.get(today) ?? 0,
    minutesLast7Days: sumRange(byDay, weekStart, today),
    tasksDoneLast7Days,
    overdueCount: candidates.filter((t) => t.isOverdue).length,
    weeklyMinutes,
    suggestion: suggestNextTask(candidates, today),
    upcoming,
    paths: listPaths(db, today),
  };
}
