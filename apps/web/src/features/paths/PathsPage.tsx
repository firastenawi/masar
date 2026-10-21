import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { PathSummary } from "@masar/shared";
import { Badge, EmptyState, Modal, ProgressBar, btnPrimary, btnSecondary, card } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { usePaths } from "./api";
import { PathForm } from "./PathForm";

export function PathsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const paths = usePaths();
  const [creating, setCreating] = useState(false);

  const newButton = (
    <button className={btnPrimary} onClick={() => setCreating(true)}>
      ＋ {t("paths.new")}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("paths.title")}</h1>
        {paths.data && paths.data.length > 0 && newButton}
      </header>

      {paths.isPending && <p className="text-slate-500">{t("common.loading")}</p>}
      {paths.isError && (
        <EmptyState
          title={t("common.loadError")}
          hint={paths.error.message}
          action={<button className={btnSecondary} onClick={() => paths.refetch()}>{t("common.retry")}</button>}
        />
      )}
      {paths.data?.length === 0 && <EmptyState title={t("paths.empty")} hint={t("paths.emptyHint")} action={newButton} />}

      {paths.data && paths.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paths.data.map((path) => (
            <PathCard key={path.id} path={path} />
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={t("paths.new")}>
        <PathForm
          onCancel={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            void navigate(`/paths/${id}`);
          }}
        />
      </Modal>
    </div>
  );
}

function PathCard({ path }: { path: PathSummary }) {
  const { t } = useTranslation();
  const { progress } = path;

  return (
    <Link
      to={`/paths/${path.id}`}
      className={`${card} flex flex-col gap-3 p-5 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-600`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold" dir="auto">{path.title}</h2>
        {path.status !== "active" && <Badge>{t(`pathStatus.${path.status}`)}</Badge>}
      </div>
      {path.goal && <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-400" dir="auto">{path.goal}</p>}

      <div className="mt-auto space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{t("paths.tasksDone", { done: progress.doneCount, total: progress.taskCount })}</span>
          <span className="font-semibold">{progress.percent}%</span>
        </div>
        <ProgressBar percent={progress.percent} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge tone="blue">
          {t("paths.level")} {path.currentLevel} ← {path.targetLevel}
        </Badge>
        {path.targetDate && <Badge>{t("paths.target")}: {formatDate(path.targetDate)}</Badge>}
        {path.overdueCount > 0 && <Badge tone="red">{t("paths.overdue", { count: path.overdueCount })}</Badge>}
        {path.overdueCount === 0 && path.nextDueDate && (
          <Badge tone="amber">{t("paths.nextDue")}: {formatDate(path.nextDueDate)}</Badge>
        )}
      </div>
    </Link>
  );
}
