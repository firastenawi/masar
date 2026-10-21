import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Suggestion } from "@masar/shared";
import { btnPrimary, btnSecondary, card } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { useStartTimer } from "../sessions/TimerBar";

/** بطاقة "خطوتك التالية": أهم ما يُعرض في الصفحة الرئيسية وصفحة اليوم */
export function NextStepCard({ suggestion }: { suggestion: Suggestion | null }) {
  const { t } = useTranslation();
  const startTimer = useStartTimer();

  if (!suggestion) {
    return (
      <section className={`${card} p-5`}>
        <p className="text-sm font-semibold text-slate-500">{t("suggestion.title")}</p>
        <p className="mt-2">{t("suggestion.none")}</p>
        <Link to="/paths" className={`${btnSecondary} mt-3`}>{t("nav.paths")}</Link>
      </section>
    );
  }

  const { task, reason } = suggestion;
  return (
    <section className={`${card} border-s-4 border-s-brand-600 p-5`}>
      <p className="text-sm font-semibold text-brand-700 dark:text-brand-100">
        {t("suggestion.title")} · {t(`suggestion.reasons.${reason}`, { date: task.dueDate ? formatDate(task.dueDate) : "" })}
      </p>
      <h2 className="mt-2 text-xl font-bold" dir="auto">{task.title}</h2>
      <p className="mt-1 text-sm text-slate-500" dir="auto">
        {task.pathTitle} › {task.stageTitle}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={btnPrimary}
          onClick={() => startTimer({ pathId: task.pathId, taskId: task.id, label: task.title })}
        >
          ▶ {t("timer.startNow")}
        </button>
        <Link to={`/paths/${task.pathId}`} className={btnSecondary}>{t("suggestion.openPath")}</Link>
      </div>
    </section>
  );
}
