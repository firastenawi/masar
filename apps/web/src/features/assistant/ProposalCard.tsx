import { useTranslation } from "react-i18next";
import type { PathDetail, Proposal, ProposalOperation } from "@masar/shared";
import { Badge, FormError, btnPrimary, btnSecondary } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { usePaths, useRoadmapMutation } from "../paths/api";
import { assistantApi } from "./api";

/** بطاقة اقتراح التعديل: تعرض العمليات بلغة مفهومة ولا تطبّق شيئاً إلا بموافقة صريحة */
export function ProposalCard({ proposal, path }: { proposal: Proposal; path: PathDetail | undefined }) {
  const { t } = useTranslation();
  const paths = usePaths();
  const apply = useRoadmapMutation(() => assistantApi.apply(proposal.id));
  const reject = useRoadmapMutation(() => assistantApi.reject(proposal.id));

  const stageTitles = new Map(path?.stages.map((s) => [s.id, s.title]));
  const taskTitles = new Map(path?.stages.flatMap((s) => s.tasks.map((task) => [task.id, task.title] as const)));
  const pathTitles = new Map(paths.data?.map((p) => [p.id, p.title]));
  const refTitles = new Map(
    proposal.operations.flatMap((op) => (op.op === "create_stage" && op.ref ? [[op.ref, op.title] as const] : [])),
  );

  const name = (map: Map<string, string>, id: string | null | undefined) => (id ? map.get(id) ?? t("assistant.ops.unknown") : "");

  function describe(op: ProposalOperation): { icon: string; text: string; details: string[] } {
    switch (op.op) {
      case "create_stage":
        return {
          icon: "＋",
          text: t("assistant.ops.createStage", { title: op.title, path: name(pathTitles, op.pathId) }),
          details: op.targetDate ? [`${t("fields.targetDate")}: ${formatDate(op.targetDate)}`] : [],
        };
      case "create_task":
        return {
          icon: "＋",
          text: t("assistant.ops.createTask", {
            title: op.title,
            stage: op.stageRef ? refTitles.get(op.stageRef) ?? op.stageRef : name(stageTitles, op.stageId),
          }),
          details: [
            op.type && t(`taskType.${op.type}`),
            op.priority && `${t("fields.priority")}: ${t(`taskPriority.${op.priority}`)}`,
            op.estimateMinutes && t("task.minutes", { count: op.estimateMinutes }),
            op.dueDate && `${t("fields.dueDate")}: ${formatDate(op.dueDate)}`,
          ].filter((d): d is string => Boolean(d)),
        };
      case "update_task":
        return {
          icon: "✎",
          text: t("assistant.ops.updateTask", { title: name(taskTitles, op.taskId) }),
          details: [
            op.title && `${t("fields.title")} ← ${op.title}`,
            op.status && `${t("fields.status")} ← ${t(`taskStatus.${op.status}`)}`,
            op.priority && `${t("fields.priority")} ← ${t(`taskPriority.${op.priority}`)}`,
            op.dueDate && `${t("fields.dueDate")} ← ${formatDate(op.dueDate)}`,
            op.estimateMinutes && `${t("fields.estimateMinutes")} ← ${op.estimateMinutes}`,
          ].filter((d): d is string => Boolean(d)),
        };
      case "postpone_task":
        return {
          icon: "⏸",
          text: t("assistant.ops.postponeTask", { title: name(taskTitles, op.taskId), date: formatDate(op.until) }),
          details: op.reason ? [`${t("fields.reason")}: ${op.reason}`] : [],
        };
      case "update_path":
        return {
          icon: "✎",
          text: t("assistant.ops.updatePath", { title: name(pathTitles, op.pathId) }),
          details: [
            op.targetDate && `${t("fields.targetDate")} ← ${formatDate(op.targetDate)}`,
            op.goal && `${t("fields.goal")} ← ${op.goal}`,
          ].filter((d): d is string => Boolean(d)),
        };
    }
  }

  const statusTone = { pending: "amber", applied: "green", rejected: "slate", failed: "red" } as const;
  const busy = apply.isPending || reject.isPending;

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-brand-100 bg-brand-50/60 p-3 dark:border-brand-900 dark:bg-brand-900/30">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{t("assistant.proposalTitle")}</span>
        <Badge tone={statusTone[proposal.status]}>{t(`assistant.proposalStatus.${proposal.status}`)}</Badge>
      </div>
      <p className="text-sm" dir="auto">{proposal.summary}</p>
      <ul className="space-y-1.5 text-sm">
        {proposal.operations.map((op, i) => {
          const d = describe(op);
          return (
            <li key={i} className="flex gap-2">
              <span className="w-4 shrink-0 text-center text-slate-500" aria-hidden>{d.icon}</span>
              <span>
                <span dir="auto">{d.text}</span>
                {d.details.length > 0 && (
                  <span className="block text-xs text-slate-500" dir="auto">{d.details.join(" · ")}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {proposal.status === "failed" && proposal.error && <FormError message={proposal.error} />}
      <FormError message={apply.error?.message ?? reject.error?.message} />
      {proposal.status === "pending" && (
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={busy} onClick={() => apply.mutate(undefined)}>
            ✓ {t("assistant.apply")}
          </button>
          <button className={btnSecondary} disabled={busy} onClick={() => reject.mutate(undefined)}>
            {t("assistant.reject")}
          </button>
        </div>
      )}
    </div>
  );
}
