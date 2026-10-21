import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { todayIn, type StudySession } from "@masar/shared";
import type { z } from "zod";
import type { sessionCreateSchema, sessionListQuerySchema, sessionUpdateSchema } from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { learningPaths, studySessions, tasks } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import type { Tx } from "../roadmap/changelog";
import { activePath, activeTask, updateTaskInTx } from "../roadmap/roadmap.commands";
import { getTimeZone } from "../settings/settings.service";

/** نسمح بفارق بسيط في الساعة بين الجهاز والخادم */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const now = () => new Date().toISOString();

/** يحدد المسار من المهمة إن وُجدت، ويتأكد أن المسار والمهمة نشطان ومتوافقان */
function resolveLinks(tx: Tx, pathId: string | null, taskId: string | null) {
  if (taskId) {
    const { stage } = activeTask(tx, taskId);
    if (pathId && pathId !== stage.pathId) {
      throw badRequest("TASK_PATH_MISMATCH", "المهمة المختارة لا تتبع المسار المختار");
    }
    return { pathId: stage.pathId, taskId };
  }
  if (pathId) activePath(tx, pathId);
  return { pathId, taskId: null };
}

function assertNotFuture(startedAt: string) {
  if (Date.parse(startedAt) > Date.now() + FUTURE_TOLERANCE_MS) {
    throw badRequest("FUTURE_SESSION", "وقت بداية الجلسة في المستقبل");
  }
}

export function createSession(db: AppDatabase, input: z.output<typeof sessionCreateSchema>) {
  const timeZone = getTimeZone(db);
  assertNotFuture(input.startedAt);

  return db.transaction((tx) => {
    const links = resolveLinks(tx, input.pathId ?? null, input.taskId ?? null);
    const { completeTask, pathId: _p, taskId: _t, ...fields } = input;

    const row = tx
      .insert(studySessions)
      .values({
        id: randomUUID(),
        ...fields,
        ...links,
        localDate: todayIn(timeZone, new Date(input.startedAt)),
      })
      .returning()
      .get();

    // جلسة على مهمة تعني أنها بدأت؛ وإكمالها اختياري. كلاهما يُسجَّل في سجل التغييرات
    if (links.taskId) {
      const { task } = activeTask(tx, links.taskId);
      if (completeTask && task.status !== "done") {
        updateTaskInTx(tx, task.id, { status: "done" });
      } else if (task.status === "not_started" || task.status === "postponed") {
        updateTaskInTx(tx, task.id, { status: "in_progress" });
      }
    }
    return row;
  });
}

export function updateSession(db: AppDatabase, id: string, patch: z.output<typeof sessionUpdateSchema>) {
  const timeZone = getTimeZone(db);
  return db.transaction((tx) => {
    const before = tx
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, id), isNull(studySessions.archivedAt)))
      .get();
    if (!before) throw notFound("الجلسة");

    const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as typeof patch;
    const links =
      changes.pathId !== undefined || changes.taskId !== undefined
        ? resolveLinks(
            tx,
            changes.pathId !== undefined ? changes.pathId : before.pathId,
            changes.taskId !== undefined ? changes.taskId : before.taskId,
          )
        : {};
    if (changes.startedAt) assertNotFuture(changes.startedAt);

    return tx
      .update(studySessions)
      .set({
        ...changes,
        ...links,
        ...(changes.startedAt ? { localDate: todayIn(timeZone, new Date(changes.startedAt)) } : {}),
        updatedAt: now(),
      })
      .where(eq(studySessions.id, id))
      .returning()
      .get();
  });
}

export function archiveSession(db: AppDatabase, id: string) {
  const result = db
    .update(studySessions)
    .set({ archivedAt: now(), updatedAt: now() })
    .where(and(eq(studySessions.id, id), isNull(studySessions.archivedAt)))
    .run();
  if (result.changes === 0) throw notFound("الجلسة");
}

export function listSessions(db: AppDatabase, query: z.output<typeof sessionListQuerySchema>): StudySession[] {
  const conditions = [isNull(studySessions.archivedAt)];
  if (query.pathId) conditions.push(eq(studySessions.pathId, query.pathId));
  if (query.reviewOnly === "true") conditions.push(isNotNull(studySessions.reviewLater));

  return db
    .select({
      id: studySessions.id,
      pathId: studySessions.pathId,
      pathTitle: learningPaths.title,
      taskId: studySessions.taskId,
      taskTitle: tasks.title,
      startedAt: studySessions.startedAt,
      localDate: studySessions.localDate,
      durationMinutes: studySessions.durationMinutes,
      topics: studySessions.topics,
      resources: studySessions.resources,
      notes: studySessions.notes,
      problems: studySessions.problems,
      solutions: studySessions.solutions,
      accomplished: studySessions.accomplished,
      reviewLater: studySessions.reviewLater,
      createdAt: studySessions.createdAt,
    })
    .from(studySessions)
    .leftJoin(learningPaths, eq(studySessions.pathId, learningPaths.id))
    .leftJoin(tasks, eq(studySessions.taskId, tasks.id))
    .where(and(...conditions))
    .orderBy(desc(studySessions.startedAt))
    .limit(query.limit)
    .all();
}
