import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  taskUpdateSchema,
  type Stage,
  type Task,
} from "@masar/shared";
import { Field, FormError, btnPrimary, btnSecondary, input } from "../../components/ui";
import { fieldErrors, optionalInt, type FieldErrors } from "../../lib/forms";
import { roadmapApi, useRoadmapMutation } from "./api";

/** تعديل كامل للمهمة، بما فيه نقلها إلى مرحلة أخرى في نفس المسار */
export function TaskForm({ task, stages, onDone }: { task: Task; stages: Stage[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [values, setValues] = useState({
    title: task.title,
    description: task.description ?? "",
    type: task.type,
    status: task.status,
    priority: task.priority,
    difficulty: String(task.difficulty),
    weight: String(task.weight),
    estimateMinutes: task.estimateMinutes === null ? "" : String(task.estimateMinutes),
    dueDate: task.dueDate ?? "",
    notes: task.notes ?? "",
    stageId: task.stageId,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useRoadmapMutation((payload: Record<string, unknown>) => roadmapApi.updateTask(task.id, payload));

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...values,
      difficulty: Number(values.difficulty),
      weight: Number(values.weight),
      estimateMinutes: optionalInt(values.estimateMinutes),
    };
    const result = taskUpdateSchema.safeParse(payload);
    if (!result.success) return setErrors(fieldErrors(result.error));
    setErrors({});
    mutation.mutate(payload, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={mutation.error?.message} />
      <Field label={t("fields.title")} error={errors.title}>
        <input className={input} value={values.title} onChange={set("title")} dir="auto" autoFocus maxLength={200} />
      </Field>
      <Field label={t("fields.description")} error={errors.description}>
        <textarea className={input} rows={2} value={values.description} onChange={set("description")} dir="auto" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("fields.status")}>
          <select className={input} value={values.status} onChange={set("status")}>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{t(`taskStatus.${s}`)}</option>)}
          </select>
        </Field>
        <Field label={t("fields.type")}>
          <select className={input} value={values.type} onChange={set("type")}>
            {TASK_TYPES.map((s) => <option key={s} value={s}>{t(`taskType.${s}`)}</option>)}
          </select>
        </Field>
        <Field label={t("fields.priority")}>
          <select className={input} value={values.priority} onChange={set("priority")}>
            {TASK_PRIORITIES.map((s) => <option key={s} value={s}>{t(`taskPriority.${s}`)}</option>)}
          </select>
        </Field>
        <Field label={t("fields.difficulty")} error={errors.difficulty}>
          <select className={input} value={values.difficulty} onChange={set("difficulty")}>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{"★".repeat(d)}</option>)}
          </select>
        </Field>
        <Field label={t("fields.dueDate")} error={errors.dueDate}>
          <input type="date" className={input} value={values.dueDate} onChange={set("dueDate")} />
        </Field>
        <Field label={t("fields.estimateMinutes")} error={errors.estimateMinutes}>
          <input type="number" min={1} inputMode="numeric" className={input} value={values.estimateMinutes} onChange={set("estimateMinutes")} />
        </Field>
      </div>

      <Field label={`${t("fields.weight")} — ${t("fields.weightHint")}`} error={errors.weight}>
        <input type="number" min={1} max={10} inputMode="numeric" className={input} value={values.weight} onChange={set("weight")} />
      </Field>

      {stages.length > 1 && (
        <Field label={t("fields.stageId")}>
          <select className={input} value={values.stageId} onChange={set("stageId")}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
      )}

      <Field label={t("fields.notes")} error={errors.notes}>
        <textarea className={input} rows={3} value={values.notes} onChange={set("notes")} dir="auto" />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnSecondary} onClick={onDone}>{t("common.cancel")}</button>
        <button type="submit" className={btnPrimary} disabled={mutation.isPending}>
          {mutation.isPending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}
