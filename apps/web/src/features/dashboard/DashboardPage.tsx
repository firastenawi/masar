import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { formatMinutes } from "@masar/shared";
import { Badge, EmptyState, ProgressBar, btnPrimary, btnSecondary, card } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { useDashboard } from "../paths/api";
import { NextStepCard } from "../today/NextStepCard";
import { WeeklyChart } from "./WeeklyChart";

export function DashboardPage() {
  const { t } = useTranslation();
  const dashboard = useDashboard();

  if (dashboard.isPending) return <p className="text-slate-500">{t("common.loading")}</p>;
  if (dashboard.isError) {
    return (
      <EmptyState
        title={t("common.loadError")}
        hint={dashboard.error.message}
        action={<button className={btnSecondary} onClick={() => dashboard.refetch()}>{t("common.retry")}</button>}
      />
    );
  }

  const d = dashboard.data;

  if (d.paths.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-2xl font-bold">{t("dashboard.welcome")}</h1>
        <EmptyState
          title={t("dashboard.startTitle")}
          hint={t("dashboard.intro")}
          action={<Link to="/paths" className={btnPrimary}>＋ {t("paths.new")}</Link>}
        />
      </div>
    );
  }

  const stats = [
    { label: t("dashboard.stats.streak"), value: t("streak.days", { count: d.streak.current }), sub: t("dashboard.stats.longest", { count: d.streak.longest }) },
    { label: t("dashboard.stats.today"), value: formatMinutes(d.minutesToday) },
    { label: t("dashboard.stats.week"), value: formatMinutes(d.minutesLast7Days) },
    { label: t("dashboard.stats.doneWeek"), value: String(d.tasksDoneLast7Days) },
    { label: t("dashboard.stats.overdue"), value: String(d.overdueCount), alert: d.overdueCount > 0 },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">{t("nav.dashboard")}</h1>

      <NextStepCard suggestion={d.suggestion} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className={`${card} p-4`}>
            <p className="text-xs text-slate-500">{stat.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${stat.alert ? "text-red-600" : ""}`}>{stat.value}</p>
            {stat.sub && <p className="text-xs text-slate-400">{stat.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className={`${card} p-5 lg:col-span-3`}>
          <h2 className="mb-6 text-sm font-semibold text-slate-500">{t("dashboard.chartTitle")}</h2>
          <WeeklyChart buckets={d.weeklyMinutes} />
        </section>

        <section className={`${card} p-5 lg:col-span-2`}>
          <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("dashboard.upcoming")}</h2>
          {d.upcoming.length === 0 ? (
            <p className="text-sm text-slate-400">{t("dashboard.noUpcoming")}</p>
          ) : (
            <ul className="space-y-2.5">
              {d.upcoming.map((task) => (
                <li key={task.id} className="flex items-start justify-between gap-2 text-sm">
                  <Link to={`/paths/${task.pathId}`} className="min-w-0 hover:text-brand-700">
                    <span className="block truncate" dir="auto">{task.title}</span>
                    <span className="block truncate text-xs text-slate-400" dir="auto">{task.pathTitle}</span>
                  </Link>
                  <Badge tone={task.dueDate === d.today ? "amber" : "slate"}>{formatDate(task.dueDate)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={`${card} p-5`}>
        <h2 className="mb-4 text-sm font-semibold text-slate-500">{t("dashboard.goals")}</h2>
        <ul className="space-y-4">
          {d.paths.map((path) => (
            <li key={path.id}>
              <Link to={`/paths/${path.id}`} className="block space-y-1.5 hover:opacity-80">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium" dir="auto">{path.title}</span>
                  {path.status !== "active" && <Badge>{t(`pathStatus.${path.status}`)}</Badge>}
                  {path.overdueCount > 0 && <Badge tone="red">{t("paths.overdue", { count: path.overdueCount })}</Badge>}
                  <span className="ms-auto text-xs text-slate-400">
                    {path.targetDate ? `${t("paths.target")}: ${formatDate(path.targetDate)}` : ""}
                  </span>
                  <span className="w-10 text-end font-semibold">{path.progress.percent}%</span>
                </div>
                <ProgressBar percent={path.progress.percent} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
