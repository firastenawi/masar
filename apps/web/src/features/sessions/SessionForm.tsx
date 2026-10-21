import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { sessionCreateSchema, type StudySession } from "@masar/shared";
import { Field, FormError, btnPrimary, btnSecondary, input } from "../../components/ui";
import { fieldErrors, optionalInt, type FieldErrors } from "../../lib/forms";
import { fromLocalInput, toLocalInput } from "../../lib/format";
import { usePath, usePaths, useRoadmapMutation } from "../paths/api";
import { sessionsApi } from "./api";

export interface SessionDraft {
  pathId: string | null;
  taskId: string | null;
  startedAt: string;
  durationMinutes: number | null;
}

const TEXT_FIELDS = ["topics", "accomplished", "problems", "solutions", "notes", "resources", "reviewLater"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

/** تسجيل جلسة جديدة (من المؤقت أو يدوياً) أو تعديل جلسة موجودة */
export function SessionForm({
  draft,
  session,
  onDone,
  onCancel,
}: {
  draft?: SessionDraft;
  session?: StudySession;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const initial = session ?? draft;
  const [values, setValues] = useState({
    pathId: initial?.pathId ?? "",
    taskId: initial?.taskId ?? "",
    startedAt: toLocalInput(initial?.startedAt ?? new Date().toISOString()),
    durationMinutes: initial?.durationMinutes ? String(initial.durationMinutes) : "",
    ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, session?.[f] ?? ""])),
  } as Record<"pathId" | "taskId" | "startedAt" | "durationMinutes" | TextField, string>);
  const [completeTask, setCompleteTask] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const paths = usePaths();
  const selectedPath = usePath(values.pathId);
  const pathTasks = values.pathId && selectedPath.data ? selectedPath.data.stages.flatMap((s) => s.tasks) : [];
  // المهام المكتملة لا تظهر إلا إذا كانت هي المرتبطة أصلاً
  const taskOptions = pathTasks.filter((task) => task.status !== "done" || task.id === values.taskId);

  const mutation = useRoadmapMutation((payload: Record<string, unknown>) =>
    session ? sessionsApi.update(session.id, payload) : sessionsApi.create(payload as never),
  );

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value, ...(key === "pathId" ? { taskId: "" } : {}) }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!values.startedAt) return setErrors({ startedAt: t("session.startRequired") });
    const payload: Record<string, unknown> = {
      ...values,
      startedAt: fromLocalInput(values.startedAt),
      durationMinutes: optionalInt(values.durationMinutes),
      ...(session ? {} : { completeTask: values.taskId ? completeTask : false }),
    };
    const result = sessionCreateSchema.safeParse(payload);
    if (!result.success) return setErrors(fieldErrors(result.error));
    setErrors({});
    mutation.mutate(payload, { onSuccess: onDone });
  }

  const textArea = (field: TextField, rows = 2) => (
    <Field label={t(`session.fields.${field}`)} error={errors[field]}>
      <textarea className={input} rows={rows} value={values[field]} onChange={set(field)} dir="auto" placeholder={t(`session.placeholders.${field}`)} />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={mutation.error?.message} />

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("session.fields.startedAt")} error={errors.startedAt}>
          <input type="datetime-local" className={input} value={values.startedAt} onChange={set("startedAt")} />
        </Field>
        <Field label={t("session.fields.durationMinutes")} error={errors.durationMinutes}>
          <input type="number" min={1} max={1440} inputMode="numeric" className={input} value={values.durationMinutes} onChange={set("durationMinutes")} />
        </Field>
        <Field label={`${t("session.fields.path")} (${t("common.optional")})`} error={errors.pathId}>
          <select className={input} value={values.pathId} onChange={set("pathId")}>
            <option value="">—</option>
            {paths.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        <Field label={`${t("session.fields.task")} (${t("common.optional")})`} error={errors.taskId}>
          <select className={input} value={values.taskId} onChange={set("taskId")} disabled={!values.pathId}>
            <option value="">—</option>
            {taskOptions.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </Field>
      </div>

      {!session && values.taskId && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={completeTask} onChange={(e) => setCompleteTask(e.target.checked)} />
          {t("session.completeTask")}
        </label>
      )}

      {textArea("topics", 1)}
      {textArea("accomplished")}
      <div className="grid gap-3 sm:grid-cols-2">
        {textArea("problems")}
        {textArea("solutions")}
      </div>
      {textArea("notes", 3)}
      {textArea("resources", 1)}
      {textArea("reviewLater", 1)}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnSecondary} onClick={onCancel}>{t("common.cancel")}</button>
        <button type="submit" className={btnPrimary} disabled={mutation.isPending}>
          {mutation.isPending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}
