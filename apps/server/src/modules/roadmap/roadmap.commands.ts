import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { z } from "zod";
import type {
  pathCreateSchema,
  pathUpdateSchema,
  skillCreateSchema,
  skillUpdateSchema,
  stageCreateSchema,
  stageUpdateSchema,
  taskCreateSchema,
  taskPostponeSchema,
  taskUpdateSchema,
} from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { learningPaths, skills, stages, tasks } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { diffFields, logChange, type ChangeMeta, type Tx } from "./changelog";

type Out<T extends z.ZodType> = z.output<T>;

const now = () => new Date().toISOString();

/** يحذف المفاتيح غير المرسلة (undefined) حتى لا تُكتب كـ NULL */
function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function nextSortOrder(tx: Tx, table: SQLiteTable, sortColumn: SQLiteColumn, where: SQL): number {
  const row = tx
    .select({ max: sql<number>`coalesce(max(${sortColumn}), -1)` })
    .from(table)
    .where(where)
    .get();
  return (row?.max ?? -1) + 1;
}

function assertDatesInOrder(startDate: string | null, targetDate: string | null) {
  if (startDate && targetDate && startDate > targetDate) {
    throw badRequest("INVALID_DATES", "الموعد المستهدف يجب أن يكون بعد تاريخ البداية");
  }
}

function assertSameSet(given: string[], existing: string[]) {
  const a = [...given].sort();
  const b = [...existing].sort();
  if (new Set(given).size !== given.length || a.length !== b.length || a.some((id, i) => id !== b[i])) {
    throw badRequest("INVALID_ORDER", "قائمة الترتيب لا تطابق العناصر الحالية، حدّث الصفحة وحاول مجدداً");
  }
}

// ───────── قراءة العناصر النشطة داخل الـ Transaction ─────────

export function activePath(tx: Tx, id: string) {
  const row = tx
    .select()
    .from(learningPaths)
    .where(and(eq(learningPaths.id, id), isNull(learningPaths.archivedAt)))
    .get();
  if (!row) throw notFound("المسار");
  return row;
}

function activeStage(tx: Tx, id: string) {
  const row = tx
    .select()
    .from(stages)
    .where(and(eq(stages.id, id), isNull(stages.archivedAt)))
    .get();
  if (!row) throw notFound("المرحلة");
  activePath(tx, row.pathId);
  return row;
}

export function activeTask(tx: Tx, id: string) {
  const row = tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.archivedAt)))
    .get();
  if (!row) throw notFound("المهمة");
  const stage = activeStage(tx, row.stageId);
  return { task: row, stage };
}

function activeSkill(tx: Tx, id: string) {
  const row = tx
    .select()
    .from(skills)
    .where(and(eq(skills.id, id), isNull(skills.archivedAt)))
    .get();
  if (!row) throw notFound("المهارة");
  activePath(tx, row.pathId);
  return row;
}

// ───────── المسارات ─────────

export function createPath(db: AppDatabase, input: Out<typeof pathCreateSchema>, meta?: ChangeMeta) {
  return db.transaction((tx) => {
    const row = tx
      .insert(learningPaths)
      .values({
        id: randomUUID(),
        ...input,
        sortOrder: nextSortOrder(tx, learningPaths, learningPaths.sortOrder, isNull(learningPaths.archivedAt)),
      })
      .returning()
      .get();
    logChange(
      tx,
      { entityType: "path", entityId: row.id, entityTitle: row.title, pathId: row.id, action: "create", after: input },
      meta,
    );
    return row;
  });
}

export function updatePath(db: AppDatabase, id: string, patch: Out<typeof pathUpdateSchema>, meta?: ChangeMeta) {
  return db.transaction((tx) => updatePathInTx(tx, id, patch, meta));
}

export function updatePathInTx(tx: Tx, id: string, patch: Out<typeof pathUpdateSchema>, meta?: ChangeMeta) {
  const before = activePath(tx, id);
  const changes = defined(patch);
  assertDatesInOrder(
    changes.startDate !== undefined ? changes.startDate : before.startDate,
    changes.targetDate !== undefined ? changes.targetDate : before.targetDate,
  );
  const after = tx
    .update(learningPaths)
    .set({ ...changes, updatedAt: now() })
    .where(eq(learningPaths.id, id))
    .returning()
    .get();
  const diff = diffFields(before, changes);
  if (diff) {
    logChange(tx, { entityType: "path", entityId: id, entityTitle: after.title, pathId: id, action: "update", ...diff }, meta);
  }
  return after;
}

export function archivePath(db: AppDatabase, id: string, meta?: ChangeMeta) {
  db.transaction((tx) => {
    const path = activePath(tx, id);
    tx.update(learningPaths).set({ archivedAt: now(), updatedAt: now() }).where(eq(learningPaths.id, id)).run();
    logChange(tx, { entityType: "path", entityId: id, entityTitle: path.title, pathId: id, action: "archive" }, meta);
  });
}

// ───────── المهارات ─────────

export function createSkill(db: AppDatabase, pathId: string, input: Out<typeof skillCreateSchema>, meta?: ChangeMeta) {
  return db.transaction((tx) => {
    activePath(tx, pathId);
    const row = tx
      .insert(skills)
      .values({
        id: randomUUID(),
        pathId,
        ...input,
        sortOrder: nextSortOrder(tx, skills, skills.sortOrder, and(eq(skills.pathId, pathId), isNull(skills.archivedAt))!),
      })
      .returning()
      .get();
    logChange(tx, { entityType: "skill", entityId: row.id, entityTitle: row.name, pathId, action: "create", after: input }, meta);
    return row;
  });
}

export function updateSkill(db: AppDatabase, id: string, patch: Out<typeof skillUpdateSchema>, meta?: ChangeMeta) {
  return db.transaction((tx) => {
    const before = activeSkill(tx, id);
    const changes = defined(patch);
    const after = tx.update(skills).set({ ...changes, updatedAt: now() }).where(eq(skills.id, id)).returning().get();
    const diff = diffFields(before, changes);
    if (diff) {
      logChange(tx, { entityType: "skill", entityId: id, entityTitle: after.name, pathId: after.pathId, action: "update", ...diff }, meta);
    }
    return after;
  });
}

export function archiveSkill(db: AppDatabase, id: string, meta?: ChangeMeta) {
  db.transaction((tx) => {
    const skill = activeSkill(tx, id);
    tx.update(skills).set({ archivedAt: now(), updatedAt: now() }).where(eq(skills.id, id)).run();
    logChange(tx, { entityType: "skill", entityId: id, entityTitle: skill.name, pathId: skill.pathId, action: "archive" }, meta);
  });
}

// ───────── المراحل ─────────

export function createStage(db: AppDatabase, pathId: string, input: Out<typeof stageCreateSchema>, meta?: ChangeMeta) {
  return db.transaction((tx) => createStageInTx(tx, pathId, input, meta));
}

export function createStageInTx(tx: Tx, pathId: string, input: Out<typeof stageCreateSchema>, meta?: ChangeMeta) {
  activePath(tx, pathId);
  const row = tx
    .insert(stages)
    .values({
      id: randomUUID(),
      pathId,
      ...input,
      sortOrder: nextSortOrder(tx, stages, stages.sortOrder, and(eq(stages.pathId, pathId), isNull(stages.archivedAt))!),
    })
    .returning()
    .get();
  logChange(tx, { entityType: "stage", entityId: row.id, entityTitle: row.title, pathId, action: "create", after: input }, meta);
  return row;
}

export function updateStage(db: AppDatabase, id: string, patch: Out<typeof stageUpdateSchema>, meta?: ChangeMeta) {
  return db.transaction((tx) => {
    const before = activeStage(tx, id);
    const changes = defined(patch);
    const after = tx.update(stages).set({ ...changes, updatedAt: now() }).where(eq(stages.id, id)).returning().get();
    const diff = diffFields(before, changes);
    if (diff) {
      logChange(tx, { entityType: "stage", entityId: id, entityTitle: after.title, pathId: after.pathId, action: "update", ...diff }, meta);
    }
    return after;
  });
}

export function archiveStage(db: AppDatabase, id: string, meta?: ChangeMeta) {
  db.transaction((tx) => {
    const stage = activeStage(tx, id);
    // مهام المرحلة تبقى كما هي في القاعدة؛ تختفي من الحساب لأن مرحلتها مؤرشفة
    tx.update(stages).set({ archivedAt: now(), updatedAt: now() }).where(eq(stages.id, id)).run();
    logChange(tx, { entityType: "stage", entityId: id, entityTitle: stage.title, pathId: stage.pathId, action: "archive" }, meta);
  });
}

export function reorderStages(db: AppDatabase, pathId: string, ids: string[], meta?: ChangeMeta) {
  db.transaction((tx) => {
    const path = activePath(tx, pathId);
    const current = tx
      .select({ id: stages.id })
      .from(stages)
      .where(and(eq(stages.pathId, pathId), isNull(stages.archivedAt)))
      .orderBy(stages.sortOrder)
      .all()
      .map((r) => r.id);
    assertSameSet(ids, current);
    ids.forEach((id, index) => tx.update(stages).set({ sortOrder: index }).where(eq(stages.id, id)).run());
    logChange(
      tx,
      { entityType: "path", entityId: pathId, entityTitle: path.title, pathId, action: "reorder", before: { stageOrder: current }, after: { stageOrder: ids } },
      meta,
    );
  });
}

// ───────── المهام ─────────

/** عند الإكمال نسجّل وقت الإكمال، وعند التراجع عنه نمسحه */
function completedAtFor(status: string | undefined, previous: { status: string; completedAt: string | null }) {
  if (status === undefined || status === previous.status) return previous.completedAt;
  return status === "done" ? now() : null;
}

export function createTask(db: AppDatabase, stageId: string, input: Out<typeof taskCreateSchema>, meta?: ChangeMeta) {
  return db.transaction((tx) => createTaskInTx(tx, stageId, input, meta));
}

export function createTaskInTx(tx: Tx, stageId: string, input: Out<typeof taskCreateSchema>, meta?: ChangeMeta) {
  const stage = activeStage(tx, stageId);
  const row = tx
    .insert(tasks)
    .values({
      id: randomUUID(),
      stageId,
      ...input,
      completedAt: input.status === "done" ? now() : null,
      sortOrder: nextSortOrder(tx, tasks, tasks.sortOrder, and(eq(tasks.stageId, stageId), isNull(tasks.archivedAt))!),
    })
    .returning()
    .get();
  logChange(tx, { entityType: "task", entityId: row.id, entityTitle: row.title, pathId: stage.pathId, action: "create", after: input }, meta);
  return row;
}

export function updateTask(db: AppDatabase, id: string, patch: Out<typeof taskUpdateSchema>, meta?: ChangeMeta) {
  return db.transaction((tx) => updateTaskInTx(tx, id, patch, meta));
}

/** نفس updateTask لكن داخل Transaction قائمة (مثلاً: إكمال المهمة مع حفظ جلسة تعلم) */
export function updateTaskInTx(tx: Tx, id: string, patch: Out<typeof taskUpdateSchema>, meta?: ChangeMeta) {
  const { task: before, stage } = activeTask(tx, id);
  const changes = defined(patch);

  let sortOrder = before.sortOrder;
  if (changes.stageId !== undefined && changes.stageId !== before.stageId) {
    const target = activeStage(tx, changes.stageId);
    if (target.pathId !== stage.pathId) {
      throw badRequest("CROSS_PATH_MOVE", "لا يمكن نقل مهمة إلى مرحلة في مسار آخر");
    }
    sortOrder = nextSortOrder(tx, tasks, tasks.sortOrder, and(eq(tasks.stageId, target.id), isNull(tasks.archivedAt))!);
  }

  const after = tx
    .update(tasks)
    .set({ ...changes, sortOrder, completedAt: completedAtFor(changes.status, before), updatedAt: now() })
    .where(eq(tasks.id, id))
    .returning()
    .get();

  const diff = diffFields(before, changes);
  if (diff) {
    logChange(tx, { entityType: "task", entityId: id, entityTitle: after.title, pathId: stage.pathId, action: "update", ...diff }, meta);
  }
  return after;
}

export function postponeTask(db: AppDatabase, id: string, input: Out<typeof taskPostponeSchema>, meta?: ChangeMeta) {
  return db.transaction((tx) => postponeTaskInTx(tx, id, input, meta));
}

export function postponeTaskInTx(tx: Tx, id: string, input: Out<typeof taskPostponeSchema>, meta?: ChangeMeta) {
  const { task: before, stage } = activeTask(tx, id);
  if (before.status === "done") {
    throw badRequest("TASK_DONE", "لا يمكن تأجيل مهمة مكتملة");
  }
  const after = tx
    .update(tasks)
    .set({ status: "postponed", dueDate: input.until, updatedAt: now() })
    .where(eq(tasks.id, id))
    .returning()
    .get();
  logChange(
    tx,
    {
      entityType: "task",
      entityId: id,
      entityTitle: after.title,
      pathId: stage.pathId,
      action: "postpone",
      before: { status: before.status, dueDate: before.dueDate },
      after: { status: after.status, dueDate: after.dueDate },
    },
    { ...meta, reason: input.reason ?? meta?.reason ?? null },
  );
  return after;
}

export function archiveTask(db: AppDatabase, id: string, meta?: ChangeMeta) {
  db.transaction((tx) => {
    const { task, stage } = activeTask(tx, id);
    tx.update(tasks).set({ archivedAt: now(), updatedAt: now() }).where(eq(tasks.id, id)).run();
    logChange(tx, { entityType: "task", entityId: id, entityTitle: task.title, pathId: stage.pathId, action: "archive" }, meta);
  });
}

export function reorderTasks(db: AppDatabase, stageId: string, ids: string[], meta?: ChangeMeta) {
  db.transaction((tx) => {
    const stage = activeStage(tx, stageId);
    const current = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.stageId, stageId), isNull(tasks.archivedAt)))
      .orderBy(tasks.sortOrder)
      .all()
      .map((r) => r.id);
    assertSameSet(ids, current);
    ids.forEach((id, index) => tx.update(tasks).set({ sortOrder: index }).where(eq(tasks.id, id)).run());
    logChange(
      tx,
      { entityType: "stage", entityId: stageId, entityTitle: stage.title, pathId: stage.pathId, action: "reorder", before: { taskOrder: current }, after: { taskOrder: ids } },
      meta,
    );
  });
}
