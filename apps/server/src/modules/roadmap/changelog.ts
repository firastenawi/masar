import { randomUUID } from "node:crypto";
import type { ChangeAction, ChangeSource, EntityType } from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { changeLog } from "../../db/schema";

export type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

/** من أين جاء التغيير ولماذا؛ المساعد الذكي سيمرّر source: "ai" */
export interface ChangeMeta {
  source?: ChangeSource;
  reason?: string | null;
}

const IGNORED_FIELDS = new Set(["updatedAt", "createdAt"]);

/** يرجع الحقول التي تغيّرت فقط، أو null إذا لم يتغيّر شيء */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (IGNORED_FIELDS.has(key)) continue;
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      changedBefore[key] = before[key] ?? null;
      changedAfter[key] = after[key] ?? null;
    }
  }
  return Object.keys(changedAfter).length === 0 ? null : { before: changedBefore, after: changedAfter };
}

export function logChange(
  tx: Tx,
  entry: {
    entityType: EntityType;
    entityId: string;
    entityTitle: string;
    pathId: string;
    action: ChangeAction;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
  meta: ChangeMeta = {},
): void {
  tx.insert(changeLog)
    .values({
      id: randomUUID(),
      ...entry,
      before: entry.before ?? null,
      after: entry.after ?? null,
      source: meta.source ?? "user",
      reason: meta.reason ?? null,
      createdAt: new Date().toISOString(),
    })
    .run();
}
