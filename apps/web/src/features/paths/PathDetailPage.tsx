import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { PathDetail } from "@masar/shared";
import { Badge, EmptyState, Modal, ProgressBar, btnDanger, btnPrimary, btnSecondary, card } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { assistantApi } from "../assistant/api";
import { moveId, roadmapApi, usePath, useRoadmapMutation } from "./api";
import { HistoryPanel } from "./HistoryPanel";
import { PathForm } from "./PathForm";
import { SkillsPanel } from "./SkillsPanel";
import { StageForm } from "./StageForm";
import { StageSection } from "./StageSection";

type Tab = "stages" | "skills" | "history";

export function PathDetailPage() {
  const { pathId = "" } = useParams();
  const { t } = useTranslation();
  const path = usePath(pathId);

  if (path.isPending) return <p className="text-slate-500">{t("common.loading")}</p>;
  if (path.isError) {
    return (
      <EmptyState
        title={t("paths.notFound")}
        hint={path.error.message}
        action={<Link to="/paths" className={btnSecondary}>{t("common.back")}</Link>}
      />
    );
  }
  return <PathDetailView path={path.data} />;
}

function PathDetailView({ path }: { path: PathDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("stages");
  const [dialog, setDialog] = useState<"editPath" | "newStage" | null>(null);
  const close = () => setDialog(null);

  const archive = useRoadmapMutation(() => roadmapApi.archivePath(path.id));
  const askAssistant = useRoadmapMutation(() => assistantApi.createConversation(path.id));
  const reorderStages = useRoadmapMutation((ids: string[]) => roadmapApi.reorderStages(path.id, ids));
  const stageIds = path.stages.map((s) => s.id);

  const tabs: Tab[] = ["stages", "skills", "history"];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/paths" className="text-sm text-slate-500 hover:text-brand-700">→ {t("nav.paths")}</Link>

      {/* رأس المسار */}
      <section className={`${card} space-y-4 p-5`}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold" dir="auto">{path.title}</h1>
            {path.goal && <p className="mt-1 text-slate-600 dark:text-slate-400" dir="auto">🎯 {path.goal}</p>}
            {path.description && <p className="mt-2 text-sm text-slate-500" dir="auto">{path.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={btnSecondary}
              disabled={askAssistant.isPending}
              onClick={() =>
                askAssistant.mutate(undefined, { onSuccess: (res) => void navigate(`/assistant/${res!.id}`) })
              }
            >
              ✦ {t("assistant.askAboutPath")}
            </button>
            <button className={btnSecondary} onClick={() => setDialog("editPath")}>✎ {t("common.edit")}</button>
            <button
              className={btnDanger}
              onClick={() =>
                window.confirm(t("paths.confirmArchive", { title: path.title })) &&
                archive.mutate(undefined, { onSuccess: () => void navigate("/paths") })
              }
            >
              {t("common.archive")}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">
              {t("paths.tasksDone", { done: path.progress.doneCount, total: path.progress.taskCount })}
            </span>
            <span className="font-semibold">{path.progress.percent}%</span>
          </div>
          <ProgressBar percent={path.progress.percent} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone="blue">{t("paths.level")} {path.currentLevel} ← {path.targetLevel}</Badge>
          {path.status !== "active" && <Badge>{t(`pathStatus.${path.status}`)}</Badge>}
          {path.startDate && <Badge>{t("fields.startDate")}: {formatDate(path.startDate)}</Badge>}
          {path.targetDate && <Badge>{t("fields.targetDate")}: {formatDate(path.targetDate)}</Badge>}
          {path.overdueCount > 0 && <Badge tone="red">{t("paths.overdue", { count: path.overdueCount })}</Badge>}
        </div>
      </section>

      {/* التبويبات */}
      <div role="tablist" className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === key ? "border-brand-700 text-brand-700 dark:border-brand-100 dark:text-brand-100" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t(`paths.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === "stages" && (
        <div className="space-y-4">
          {path.stages.length === 0 ? (
            <EmptyState
              title={t("stage.empty")}
              hint={t("stage.emptyHint")}
              action={<button className={btnPrimary} onClick={() => setDialog("newStage")}>＋ {t("stage.new")}</button>}
            />
          ) : (
            <>
              {path.stages.map((stage, index) => (
                <StageSection
                  key={stage.id}
                  stage={stage}
                  stages={path.stages}
                  index={index}
                  onMove={(direction) => {
                    const next = moveId(stageIds, stage.id, direction);
                    if (next) reorderStages.mutate(next);
                  }}
                />
              ))}
              <button className={`${btnSecondary} w-full border-dashed`} onClick={() => setDialog("newStage")}>
                ＋ {t("stage.new")}
              </button>
            </>
          )}
        </div>
      )}
      {tab === "skills" && <SkillsPanel pathId={path.id} skills={path.skills} />}
      {tab === "history" && <HistoryPanel pathId={path.id} />}

      <Modal open={dialog === "editPath"} onClose={close} title={t("paths.edit")}>
        <PathForm path={path} onDone={close} onCancel={close} />
      </Modal>
      <Modal open={dialog === "newStage"} onClose={close} title={t("stage.new")}>
        <StageForm pathId={path.id} onDone={close} />
      </Modal>
    </div>
  );
}
