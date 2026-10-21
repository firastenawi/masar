import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { formatMinutes, type TaskWithContext } from "@masar/shared";
import { Badge, EmptyState, btnSecondary, card, iconBtn } from "../../components/ui";
import { formatDate, formatLongDate } from "../../lib/format";
import { roadmapApi, useRoadmapMutation, useToday } from "../paths/api";
import { useStartTimer } from "../sessions/TimerBar";
import { NextStepCard } from "./NextStepCard";

export function TodayPage() {
  const { t } = useTranslation();
  const today = useToday();

  if (today.isPending) return <p className="text-slate-500">{t("common.loading")}</p>;
  if (today.isError) {
    return (
      <EmptyState
        title={t("common.loadError")}
        hint={today.error.message}
        action={<button className={btnSecondary} onClick={() => today.refetch()}>{t("common.retry")}</button>}
      />
    );
  }

  const data = today.data;
  const sections = [
    { key: "overdue", tasks: data.overdue },
    { key: "dueToday", tasks: data.dueToday },
    { key: "inProgress", tasks: data.inProgress },
    { key: "upcoming", tasks: data.upcoming },
  ] as const;
  const nothing = sections.every((s) => s.tasks.length === 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("nav.today")}</h1>
          <p className="text-slate-500">{formatLongDate(data.today)}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Badge tone={data.streak.current > 0 ? "amber" : "slate"}>
            🔥 {t("streak.days", { count: data.streak.current })}
          </Badge>
          <Badge tone="blue">⏱ {formatMinutes(data.minutesToday)}</Badge>
        </div>
      </header>

      {data.streak.current > 0 && !data.streak.activeToday && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {t("streak.keepAlive")}
        </p>
      )}

      <NextStepCard suggestion={data.suggestion} />

      {nothing && <EmptyState title={t("today.empty")} hint={t("today.emptyHint")} />}

      {sections
        .filter((s) => s.tasks.length > 0)
        .map((section) => (
          <section key={section.key} className="space-y-2">
            <h2 className={`text-sm font-semibold ${section.key === "overdue" ? "text-red-600" : "text-slate-500"}`}>
              {t(`today.sections.${section.key}`)} ({section.tasks.length})
            </h2>
            <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
              {section.tasks.map((task) => (
                <TodayTaskRow key={task.id} task={task} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function TodayTaskRow({ task }: { task: TaskWithContext }) {
  const { t } = useTranslation();
  const startTimer = useStartTimer();
  const complete = useRoadmapMutation(() => roadmapApi.updateTask(task.id, { status: "done" }));

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-brand-700"
        checked={false}
        disabled={complete.isPending}
        onChange={() => complete.mutate(undefined)}
        aria-label={t("task.markDone")}
      />
      <div className="min-w-0 flex-1">
        <p dir="auto">{task.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Link to={`/paths/${task.pathId}`} className="hover:text-brand-700" dir="auto">
            {task.pathTitle} › {task.stageTitle}
          </Link>
          {task.dueDate && <Badge tone={task.isOverdue ? "red" : "slate"}>{formatDate(task.dueDate)}</Badge>}
          {task.status === "postponed" && <Badge tone="amber">{t("taskStatus.postponed")}</Badge>}
          {task.actualMinutes > 0 && <Badge>⏱ {formatMinutes(task.actualMinutes)}</Badge>}
        </p>
      </div>
      <button
        className={iconBtn}
        title={t("timer.start")}
        aria-label={t("timer.start")}
        onClick={() => startTimer({ pathId: task.pathId, taskId: task.id, label: task.title })}
      >
        ▶
      </button>
    </li>
  );
}
