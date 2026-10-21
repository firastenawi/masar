import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, btnPrimary, btnSecondary } from "../../components/ui";
import { SessionForm, type SessionDraft } from "./SessionForm";
import { elapsedMinutes, formatClock, timerStore, useNow, useTimer, type TimerState } from "./timer";

/** شريط المؤقت الجاري، يظهر أعلى كل الصفحات */
export function TimerBar() {
  const timer = useTimer();
  if (!timer) return null;
  return <RunningTimer timer={timer} />;
}

function RunningTimer({ timer }: { timer: TimerState }) {
  const { t } = useTranslation();
  const now = useNow();
  const [draft, setDraft] = useState<SessionDraft | null>(null);

  const stop = () =>
    setDraft({
      pathId: timer.pathId,
      taskId: timer.taskId,
      startedAt: timer.startedAt,
      durationMinutes: elapsedMinutes(timer.startedAt, Date.now()),
    });

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center gap-3 border-b border-brand-100 bg-brand-50/95 px-4 py-2 backdrop-blur md:-mx-8 md:px-8 dark:border-brand-900 dark:bg-brand-900/90">
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
        {timer.label ?? t("timer.freeSession")}
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums" dir="ltr" aria-live="off">
        {formatClock(now - Date.parse(timer.startedAt))}
      </span>
      <button className={btnPrimary} onClick={stop}>{t("timer.stop")}</button>
      <button
        className={btnSecondary}
        onClick={() => window.confirm(t("timer.confirmDiscard")) && timerStore.clear()}
      >
        {t("timer.discard")}
      </button>

      <Modal open={draft !== null} onClose={() => setDraft(null)} title={t("session.logTitle")}>
        {draft && (
          <SessionForm
            draft={draft}
            onCancel={() => setDraft(null)}
            onDone={() => {
              setDraft(null);
              timerStore.clear();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/** يبدأ مؤقتاً جديداً، ويطلب التأكيد إذا كان هناك مؤقت جارٍ */
export function useStartTimer() {
  const { t } = useTranslation();
  return (state: Omit<TimerState, "startedAt">) => {
    if (timerStore.get() && !window.confirm(t("timer.confirmReplace"))) return;
    timerStore.start(state);
  };
}
