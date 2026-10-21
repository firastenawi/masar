import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatMinutes, type Stage, type Task } from "@masar/shared";
import { useStartTimer } from "../sessions/TimerBar";
import { Badge, Modal, ProgressBar, card, iconBtn, input } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { moveId, roadmapApi, useRoadmapMutation } from "./api";
import { PostponeForm } from "./PostponeForm";
import { StageForm } from "./StageForm";
import { TaskForm } from "./TaskForm";

type Dialog = { kind: "editStage" } | { kind: "editTask"; task: Task } | { kind: "postpone"; task: Task } | null;

export function StageSection({
  stage,
  stages,
  index,
  onMove,
}: {
  stage: Stage;
  stages: Stage[];
  index: number;
  onMove: (direction: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const close = () => setDialog(null);

  const archiveStage = useRoadmapMutation(() => roadmapApi.archiveStage(stage.id));
  const createTask = useRoadmapMutation((title: string) => roadmapApi.createTask(stage.id, { title }));
  const reorder = useRoadmapMutation((ids: string[]) => roadmapApi.reorderTasks(stage.id, ids));

  function quickAdd(e: FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    createTask.mutate(title, { onSuccess: () => setQuickTitle("") });
  }

  const taskIds = stage.tasks.map((task) => task.id);
  const moveTask = (id: string, direction: -1 | 1) => {
    const next = moveId(taskIds, id, direction);
    if (next) reorder.mutate(next);
  };

  return (
    <section className={card}>
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">
            <span className="text-slate-400">{index + 1}. </span>
            {/* dir="auto" على العنوان وحده حتى لا ينقلب موضع الرقم إذا بدأ العنوان بكلمة إنجليزية */}
            <bdi>{stage.title}</bdi>
          </h3>
          {stage.description && <p className="mt-0.5 text-sm text-slate-500" dir="auto">{stage.description}</p>}
        </div>
        {stage.targetDate && <Badge>{t("fields.targetDate")}: {formatDate(stage.targetDate)}</Badge>}
        <div className="flex w-32 items-center gap-2">
          <ProgressBar percent={stage.progress.percent} className="flex-1" />
          <span className="w-9 text-xs font-semibold">{stage.progress.percent}%</span>
        </div>
        <div className="flex">
          <button className={iconBtn} onClick={() => onMove(-1)} disabled={index === 0} title={t("common.moveUp")} aria-label={t("common.moveUp")}>↑</button>
          <button className={iconBtn} onClick={() => onMove(1)} disabled={index === stages.length - 1} title={t("common.moveDown")} aria-label={t("common.moveDown")}>↓</button>
          <button className={iconBtn} onClick={() => setDialog({ kind: "editStage" })} title={t("common.edit")} aria-label={t("common.edit")}>✎</button>
          <button
            className={iconBtn}
            title={t("common.archive")}
            aria-label={t("common.archive")}
            onClick={() => window.confirm(t("stage.confirmArchive", { title: stage.title })) && archiveStage.mutate(undefined)}
          >
            🗑
          </button>
        </div>
      </header>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {stage.tasks.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">{t("stage.noTasks")}</li>}
        {stage.tasks.map((task, i) => (
          <TaskRow
            key={task.id}
            task={task}
            pathId={stage.pathId}
            isFirst={i === 0}
            isLast={i === stage.tasks.length - 1}
            onMove={(direction) => moveTask(task.id, direction)}
            onEdit={() => setDialog({ kind: "editTask", task })}
            onPostpone={() => setDialog({ kind: "postpone", task })}
          />
        ))}
      </ul>

      <form onSubmit={quickAdd} className="border-t border-slate-100 p-3 dark:border-slate-800">
        <input
          className={input}
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder={t("task.quickAdd")}
          dir="auto"
          maxLength={200}
          disabled={createTask.isPending}
        />
        {createTask.error && <p className="mt-1 text-xs text-red-600">{createTask.error.message}</p>}
      </form>

      <Modal open={dialog?.kind === "editStage"} onClose={close} title={t("stage.edit")}>
        <StageForm pathId={stage.pathId} stage={stage} onDone={close} />
      </Modal>
      <Modal open={dialog?.kind === "editTask"} onClose={close} title={t("task.edit")}>
        {dialog?.kind === "editTask" && <TaskForm task={dialog.task} stages={stages} onDone={close} />}
      </Modal>
      <Modal open={dialog?.kind === "postpone"} onClose={close} title={t("task.postponeTitle")}>
        {dialog?.kind === "postpone" && <PostponeForm task={dialog.task} onDone={close} />}
      </Modal>
    </section>
  );
}

function TaskRow({
  task,
  pathId,
  isFirst,
  isLast,
  onMove,
  onEdit,
  onPostpone,
}: {
  task: Task;
  pathId: string;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onPostpone: () => void;
}) {
  const { t } = useTranslation();
  const startTimer = useStartTimer();
  const done = task.status === "done";
  const toggle = useRoadmapMutation(() =>
    roadmapApi.updateTask(task.id, { status: done ? "not_started" : "done" }),
  );
  const archive = useRoadmapMutation(() => roadmapApi.archiveTask(task.id));

  return (
    <li className="group flex items-start gap-3 px-4 py-2.5">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-brand-700"
        checked={done}
        disabled={toggle.isPending}
        onChange={() => toggle.mutate(undefined)}
        aria-label={done ? t("task.markNotDone") : t("task.markDone")}
      />
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-start">
        <span className={`block ${done ? "text-slate-400 line-through" : ""}`} dir="auto">{task.title}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          <Badge>{t(`taskType.${task.type}`)}</Badge>
          {task.status === "in_progress" && <Badge tone="blue">{t("taskStatus.in_progress")}</Badge>}
          {task.status === "postponed" && <Badge tone="amber">{t("taskStatus.postponed")}</Badge>}
          {task.priority === "high" && <Badge tone="red">{t("fields.priority")}: {t("taskPriority.high")}</Badge>}
          {task.weight > 1 && <Badge>{t("fields.weight")} ×{task.weight}</Badge>}
          {(task.estimateMinutes || task.actualMinutes > 0) && (
            <Badge tone={task.estimateMinutes && task.actualMinutes > task.estimateMinutes ? "amber" : "slate"}>
              ⏱ {task.actualMinutes > 0 ? `${t("task.actual")} ${formatMinutes(task.actualMinutes)}` : ""}
              {task.actualMinutes > 0 && task.estimateMinutes ? " / " : ""}
              {task.estimateMinutes ? formatMinutes(task.estimateMinutes) : ""}
            </Badge>
          )}
          {task.dueDate && !done && (
            <Badge tone={task.isOverdue ? "red" : "slate"}>
              {task.isOverdue ? `${t("task.overdue")} · ` : ""}
              {formatDate(task.dueDate)}
            </Badge>
          )}
        </span>
      </button>
      <div className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button className={iconBtn} onClick={() => onMove(-1)} disabled={isFirst} title={t("common.moveUp")} aria-label={t("common.moveUp")}>↑</button>
        <button className={iconBtn} onClick={() => onMove(1)} disabled={isLast} title={t("common.moveDown")} aria-label={t("common.moveDown")}>↓</button>
        {!done && (
          <>
            <button
              className={iconBtn}
              onClick={() => startTimer({ pathId, taskId: task.id, label: task.title })}
              title={t("timer.start")}
              aria-label={t("timer.start")}
            >
              ▶
            </button>
            <button className={iconBtn} onClick={onPostpone} title={t("task.postpone")} aria-label={t("task.postpone")}>⏸</button>
          </>
        )}
        <button
          className={iconBtn}
          title={t("common.archive")}
          aria-label={t("common.archive")}
          onClick={() => window.confirm(t("task.confirmArchive", { title: task.title })) && archive.mutate(undefined)}
        >
          🗑
        </button>
      </div>
    </li>
  );
}
