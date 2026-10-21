import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { formatMinutes, type StudySession } from "@masar/shared";
import { EmptyState, Modal, btnPrimary, btnSecondary, card, iconBtn, input } from "../../components/ui";
import { formatLongDate, formatTime } from "../../lib/format";
import { usePaths, useRoadmapMutation } from "../paths/api";
import { sessionsApi, useSessions } from "./api";
import { SessionForm } from "./SessionForm";
import { useStartTimer } from "./TimerBar";

type Dialog = { kind: "new" } | { kind: "edit"; session: StudySession } | null;

export function JournalPage() {
  const { t } = useTranslation();
  const [pathId, setPathId] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const paths = usePaths();
  const sessions = useSessions({ pathId: pathId || undefined, reviewOnly });
  const startTimer = useStartTimer();

  // تجميع الجلسات حسب اليوم (القائمة مرتبة من الأحدث)
  const groups = new Map<string, StudySession[]>();
  for (const session of sessions.data ?? []) {
    const list = groups.get(session.localDate) ?? [];
    list.push(session);
    groups.set(session.localDate, list);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("journal.title")}</h1>
        <div className="flex gap-2">
          <button className={btnSecondary} onClick={() => startTimer({ pathId: null, taskId: null, label: null })}>
            ▶ {t("timer.startFree")}
          </button>
          <button className={btnPrimary} onClick={() => setDialog({ kind: "new" })}>＋ {t("journal.log")}</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <select className={`${input} w-auto`} value={pathId} onChange={(e) => setPathId(e.target.value)} aria-label={t("session.fields.path")}>
          <option value="">{t("journal.allPaths")}</option>
          {paths.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
          {t("journal.reviewOnly")}
        </label>
      </div>

      {sessions.isPending && <p className="text-slate-500">{t("common.loading")}</p>}
      {sessions.isError && <p className="text-red-600">{sessions.error.message}</p>}
      {sessions.data?.length === 0 && (
        <EmptyState
          title={reviewOnly || pathId ? t("journal.noMatches") : t("journal.empty")}
          hint={reviewOnly || pathId ? undefined : t("journal.emptyHint")}
        />
      )}

      {[...groups].map(([day, list]) => (
        <section key={day} className="space-y-2">
          <h2 className="flex items-baseline justify-between text-sm font-semibold text-slate-500">
            <span>{formatLongDate(day)}</span>
            <span>{formatMinutes(list.reduce((sum, s) => sum + s.durationMinutes, 0))}</span>
          </h2>
          {list.map((session) => (
            <SessionCard key={session.id} session={session} onEdit={() => setDialog({ kind: "edit", session })} />
          ))}
        </section>
      ))}

      <Modal open={dialog !== null} onClose={close} title={dialog?.kind === "edit" ? t("session.editTitle") : t("session.logTitle")}>
        {dialog && (
          <SessionForm session={dialog.kind === "edit" ? dialog.session : undefined} onDone={close} onCancel={close} />
        )}
      </Modal>
    </div>
  );
}

const DETAIL_FIELDS = ["accomplished", "problems", "solutions", "notes", "resources", "reviewLater"] as const;

function SessionCard({ session, onEdit }: { session: StudySession; onEdit: () => void }) {
  const { t } = useTranslation();
  const archive = useRoadmapMutation(() => sessionsApi.archive(session.id));

  return (
    <article className={`${card} space-y-2 p-4`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{formatMinutes(session.durationMinutes)}</span>
        <span className="text-slate-400">{formatTime(session.startedAt)}</span>
        {session.pathId && (
          <Link to={`/paths/${session.pathId}`} className="text-brand-700 hover:underline dark:text-brand-100" dir="auto">
            {session.pathTitle}
            {session.taskTitle && <span className="text-slate-500"> › {session.taskTitle}</span>}
          </Link>
        )}
        <span className="ms-auto flex">
          <button className={iconBtn} onClick={onEdit} aria-label={t("common.edit")} title={t("common.edit")}>✎</button>
          <button
            className={iconBtn}
            aria-label={t("common.archive")}
            title={t("common.archive")}
            onClick={() => window.confirm(t("journal.confirmArchive")) && archive.mutate(undefined)}
          >
            🗑
          </button>
        </span>
      </div>
      {session.topics && <h3 className="font-medium" dir="auto">{session.topics}</h3>}
      <dl className="space-y-1.5 text-sm">
        {DETAIL_FIELDS.filter((f) => session[f]).map((field) => (
          <div key={field}>
            <dt className="inline font-medium text-slate-500">{t(`session.fields.${field}`)}: </dt>
            <dd className="inline whitespace-pre-line" dir="auto">{session[field]}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
