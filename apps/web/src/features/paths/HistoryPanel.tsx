import { useTranslation } from "react-i18next";
import type { ChangeLogEntry } from "@masar/shared";
import { Badge, card } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { usePathHistory } from "./api";

/** حقول قيمها من قوائم ثابتة، نترجمها عند العرض */
const ENUM_PREFIX: Record<string, string> = {
  status: "taskStatus",
  type: "taskType",
  priority: "taskPriority",
};
const DATE_FIELDS = new Set(["startDate", "targetDate", "dueDate"]);

export function HistoryPanel({ pathId }: { pathId: string }) {
  const { t } = useTranslation();
  const history = usePathHistory(pathId);

  if (history.isPending) return <p className="text-slate-500">{t("common.loading")}</p>;
  if (history.isError) return <p className="text-red-600">{history.error.message}</p>;
  if (history.data.length === 0) return <p className="text-slate-500">{t("history.empty")}</p>;

  return (
    <ol className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
      {history.data.map((entry) => (
        <HistoryItem key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}

function HistoryItem({ entry }: { entry: ChangeLogEntry }) {
  const { t } = useTranslation();

  const format = (field: string, value: unknown, entityType: string): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (DATE_FIELDS.has(field) && typeof value === "string") return formatDate(value);
    if (field === "status" && entityType === "path") return t(`pathStatus.${String(value)}`);
    const prefix = ENUM_PREFIX[field];
    if (prefix) return t(`${prefix}.${String(value)}`);
    return String(value);
  };

  // في الإنشاء نعرض العنوان فقط؛ في إعادة الترتيب لا نعرض قوائم المعرّفات
  const showChanges = entry.action === "update" || entry.action === "postpone";
  const fields = showChanges ? Object.keys(entry.after ?? {}) : [];

  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={entry.action === "archive" ? "red" : entry.action === "postpone" ? "amber" : "slate"}>
          {t(`history.actions.${entry.action}`)}
        </Badge>
        <span className="text-slate-500">{t(`history.entities.${entry.entityType}`)}</span>
        <span className="font-medium" dir="auto">«{entry.entityTitle}»</span>
        {entry.source === "ai" && <Badge tone="blue">{t("history.sourceAi")}</Badge>}
        <time className="ms-auto text-xs text-slate-400" dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
      </div>
      {fields.length > 0 && (
        <ul className="space-y-0.5 text-sm text-slate-600 dark:text-slate-400">
          {fields.map((field) => (
            <li key={field}>
              {t(`fields.${field}`)}:{" "}
              <span className="text-slate-400 line-through" dir="auto">{format(field, entry.before?.[field], entry.entityType)}</span>
              {" ← "}
              <span dir="auto">{format(field, entry.after?.[field], entry.entityType)}</span>
            </li>
          ))}
        </ul>
      )}
      {entry.reason && (
        <p className="text-sm text-slate-500" dir="auto">{t("history.reason")}: {entry.reason}</p>
      )}
    </li>
  );
}
