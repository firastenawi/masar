import { and, asc, desc, eq, inArray, isNull, ne, sum } from "drizzle-orm";
import {
  computeProgress,
  isOverdue,
  type ChangeLogEntry,
  type PathDetail,
  type PathSummary,
  type SuggestionCandidate,
  type Task,
} from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { changeLog, learningPaths, skills, stages, studySessions, tasks } from "../../db/schema";
import { notFound } from "../../lib/errors";

type PathRow = typeof learningPaths.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;

export function toTask(row: TaskRow, today: string, actualMinutes = 0): Task {
  const { archivedAt: _archived, ...rest } = row;
  return { ...rest, actualMinutes, isOverdue: isOverdue(row, today) };
}

/** مجموع دقائق الجلسات (غير المؤرشفة) لكل مهمة */
export function minutesByTask(db: AppDatabase, taskIds: string[]): Map<string, number> {
  if (taskIds.length === 0) return new Map();
  const rows = db
    .select({ taskId: studySessions.taskId, minutes: sum(studySessions.durationMinutes).mapWith(Number) })
    .from(studySessions)
    .where(and(inArray(studySessions.taskId, taskIds), isNull(studySessions.archivedAt)))
    .groupBy(studySessions.taskId)
    .all();
  return new Map(rows.map((r) => [r.taskId!, r.minutes]));
}

/**
 * كل المهام غير المكتملة في المسارات النشطة مع سياقها (اسم المسار والمرحلة وترتيبهما).
 * أساس صفحة اليوم واقتراح الخطوة التالية.
 */
export function openTaskCandidates(db: AppDatabase, today: string): SuggestionCandidate[] {
  const rows = db
    .select({ task: tasks, stage: stages, path: learningPaths })
    .from(tasks)
    .innerJoin(stages, eq(tasks.stageId, stages.id))
    .innerJoin(learningPaths, eq(stages.pathId, learningPaths.id))
    .where(
      and(
        isNull(tasks.archivedAt),
        isNull(stages.archivedAt),
        isNull(learningPaths.archivedAt),
        eq(learningPaths.status, "active"),
        ne(tasks.status, "done"),
      ),
    )
    .all();

  const minutes = minutesByTask(db, rows.map((r) => r.task.id));
  return rows.map(({ task, stage, path }) => ({
    ...toTask(task, today, minutes.get(task.id) ?? 0),
    pathId: path.id,
    pathTitle: path.title,
    stageTitle: stage.title,
    pathSortOrder: path.sortOrder,
    stageSortOrder: stage.sortOrder,
  }));
}

function summarize(path: PathRow, pathTasks: TaskRow[], today: string): PathSummary {
  const { archivedAt: _archived, ...rest } = path;
  const open = pathTasks.filter((t) => t.status !== "done" && t.dueDate !== null);
  const nextDueDate = open.map((t) => t.dueDate!).sort()[0] ?? null;
  return {
    ...rest,
    progress: computeProgress(pathTasks),
    overdueCount: pathTasks.filter((t) => isOverdue(t, today)).length,
    nextDueDate,
  };
}

/** كل المهام غير المؤرشفة في مراحل غير مؤرشفة، مع معرّف المسار */
function activeTasksForPaths(db: AppDatabase, pathIds: string[]) {
  if (pathIds.length === 0) return [];
  return db
    .select({ task: tasks, pathId: stages.pathId })
    .from(tasks)
    .innerJoin(stages, eq(tasks.stageId, stages.id))
    .where(and(inArray(stages.pathId, pathIds), isNull(stages.archivedAt), isNull(tasks.archivedAt)))
    .orderBy(asc(tasks.sortOrder))
    .all();
}

export function listPaths(db: AppDatabase, today: string): PathSummary[] {
  const paths = db
    .select()
    .from(learningPaths)
    .where(isNull(learningPaths.archivedAt))
    .orderBy(asc(learningPaths.sortOrder), asc(learningPaths.createdAt))
    .all();

  const byPath = new Map<string, TaskRow[]>();
  for (const { task, pathId } of activeTasksForPaths(db, paths.map((p) => p.id))) {
    const list = byPath.get(pathId) ?? [];
    list.push(task);
    byPath.set(pathId, list);
  }
  return paths.map((path) => summarize(path, byPath.get(path.id) ?? [], today));
}

export function getActivePath(db: AppDatabase, pathId: string): PathRow {
  const path = db
    .select()
    .from(learningPaths)
    .where(and(eq(learningPaths.id, pathId), isNull(learningPaths.archivedAt)))
    .get();
  if (!path) throw notFound("المسار");
  return path;
}

export function getPathDetail(db: AppDatabase, pathId: string, today: string): PathDetail {
  const path = getActivePath(db, pathId);

  const stageRows = db
    .select()
    .from(stages)
    .where(and(eq(stages.pathId, pathId), isNull(stages.archivedAt)))
    .orderBy(asc(stages.sortOrder))
    .all();

  const skillRows = db
    .select()
    .from(skills)
    .where(and(eq(skills.pathId, pathId), isNull(skills.archivedAt)))
    .orderBy(asc(skills.sortOrder))
    .all();

  const taskRows = activeTasksForPaths(db, [pathId]).map((r) => r.task);
  const minutes = minutesByTask(db, taskRows.map((t) => t.id));

  return {
    ...summarize(path, taskRows, today),
    skills: skillRows.map(({ id, pathId: pid, name, targetLevel, sortOrder }) => ({
      id,
      pathId: pid,
      name,
      targetLevel,
      sortOrder,
    })),
    stages: stageRows.map((stage) => {
      const stageTasks = taskRows.filter((t) => t.stageId === stage.id);
      return {
        id: stage.id,
        pathId: stage.pathId,
        title: stage.title,
        description: stage.description,
        targetDate: stage.targetDate,
        sortOrder: stage.sortOrder,
        progress: computeProgress(stageTasks),
        tasks: stageTasks.map((t) => toTask(t, today, minutes.get(t.id) ?? 0)),
      };
    }),
  };
}

export function getPathHistory(db: AppDatabase, pathId: string, limit = 200): ChangeLogEntry[] {
  // السجل متاح حتى للمسار المؤرشف، فالتاريخ لا يُخفى
  return db
    .select({
      id: changeLog.id,
      entityType: changeLog.entityType,
      entityId: changeLog.entityId,
      entityTitle: changeLog.entityTitle,
      action: changeLog.action,
      before: changeLog.before,
      after: changeLog.after,
      source: changeLog.source,
      reason: changeLog.reason,
      createdAt: changeLog.createdAt,
    })
    .from(changeLog)
    .where(eq(changeLog.pathId, pathId))
    .orderBy(desc(changeLog.createdAt))
    .limit(limit)
    .all();
}
