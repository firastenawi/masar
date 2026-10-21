import { eq } from "drizzle-orm";
import { proposalOperationSchema, type ProposalOperation } from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { aiProposals } from "../../db/schema";
import { AppError, badRequest, notFound } from "../../lib/errors";
import type { ChangeMeta, Tx } from "../roadmap/changelog";
import {
  createStageInTx,
  createTaskInTx,
  postponeTaskInTx,
  updatePathInTx,
  updateTaskInTx,
} from "../roadmap/roadmap.commands";

/** يحذف القيم null/undefined: المساعد يرسل null للحقول التي لا يريد تغييرها */
function present<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], null | undefined>;
  };
}

function applyOperation(tx: Tx, op: ProposalOperation, refs: Map<string, string>, meta: ChangeMeta) {
  switch (op.op) {
    case "create_stage": {
      const stage = createStageInTx(tx, op.pathId, {
        title: op.title,
        description: op.description ?? null,
        targetDate: op.targetDate ?? null,
      }, meta);
      if (op.ref) refs.set(op.ref, stage.id);
      return;
    }
    case "create_task": {
      const stageId = op.stageId ?? (op.stageRef ? refs.get(op.stageRef) : undefined);
      if (!stageId) throw badRequest("PROPOSAL_INVALID", `المهمة «${op.title}» لا تشير إلى مرحلة صحيحة`);
      createTaskInTx(tx, stageId, {
        title: op.title,
        description: op.description ?? null,
        type: op.type ?? "lesson",
        status: "not_started",
        priority: op.priority ?? "medium",
        difficulty: 2,
        weight: op.weight ?? 1,
        estimateMinutes: op.estimateMinutes ?? null,
        dueDate: op.dueDate ?? null,
        notes: null,
      }, meta);
      return;
    }
    case "update_task": {
      const { op: _op, taskId, ...fields } = op;
      updateTaskInTx(tx, taskId, present(fields), meta);
      return;
    }
    case "postpone_task":
      postponeTaskInTx(tx, op.taskId, { until: op.until, reason: op.reason ?? null }, meta);
      return;
    case "update_path": {
      const { op: _op, pathId, ...fields } = op;
      updatePathInTx(tx, pathId, present(fields), meta);
      return;
    }
  }
}

/**
 * يطبّق كل عمليات الاقتراح في Transaction واحدة: إما تنجح كلها أو لا يتغيّر شيء.
 * كل تعديل يُسجَّل في سجل التغييرات بمصدر "ai" وسبب هو ملخص الاقتراح.
 */
export function applyProposal(db: AppDatabase, proposalId: string) {
  const proposal = db.select().from(aiProposals).where(eq(aiProposals.id, proposalId)).get();
  if (!proposal) throw notFound("الاقتراح");
  if (proposal.status !== "pending") throw badRequest("PROPOSAL_DECIDED", "تم البت في هذا الاقتراح سابقاً");

  const operations = proposalOperationSchema.array().safeParse(proposal.operations);
  const decidedAt = new Date().toISOString();

  try {
    if (!operations.success) throw badRequest("PROPOSAL_INVALID", "الاقتراح يحتوي عمليات غير صالحة");
    db.transaction((tx) => {
      const refs = new Map<string, string>();
      const meta: ChangeMeta = { source: "ai", reason: proposal.summary };
      for (const op of operations.data) applyOperation(tx, op, refs, meta);
      tx.update(aiProposals).set({ status: "applied", decidedAt, error: null }).where(eq(aiProposals.id, proposalId)).run();
    });
  } catch (error) {
    // لم يتغيّر شيء في الخطط (rollback)؛ نحفظ سبب الفشل ليظهر للمستخدم
    const message = error instanceof AppError ? error.message : "تعذّر تطبيق الاقتراح";
    db.update(aiProposals).set({ status: "failed", decidedAt, error: message }).where(eq(aiProposals.id, proposalId)).run();
    throw error instanceof AppError ? error : badRequest("PROPOSAL_FAILED", message);
  }
}

export function rejectProposal(db: AppDatabase, proposalId: string) {
  const proposal = db.select().from(aiProposals).where(eq(aiProposals.id, proposalId)).get();
  if (!proposal) throw notFound("الاقتراح");
  if (proposal.status !== "pending") throw badRequest("PROPOSAL_DECIDED", "تم البت في هذا الاقتراح سابقاً");
  db.update(aiProposals)
    .set({ status: "rejected", decidedAt: new Date().toISOString() })
    .where(eq(aiProposals.id, proposalId))
    .run();
}
