import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PATH_STATUSES, pathCreateSchema, pathUpdateSchema, type PathSummary } from "@masar/shared";
import { Field, FormError, btnPrimary, btnSecondary, input } from "../../components/ui";
import { fieldErrors, type FieldErrors } from "../../lib/forms";
import { roadmapApi, useRoadmapMutation } from "./api";

const LEVELS = [1, 2, 3, 4, 5] as const;

/** نموذج إنشاء مسار أو تعديله (إذا مُرّر path) */
export function PathForm({
  path,
  onDone,
  onCancel,
}: {
  path?: PathSummary;
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState({
    title: path?.title ?? "",
    description: path?.description ?? "",
    goal: path?.goal ?? "",
    currentLevel: String(path?.currentLevel ?? 1),
    targetLevel: String(path?.targetLevel ?? 3),
    startDate: path?.startDate ?? "",
    targetDate: path?.targetDate ?? "",
    status: path?.status ?? "active",
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const mutation = useRoadmapMutation(async (payload: Record<string, unknown>) => {
    const res = path ? await roadmapApi.updatePath(path.id, payload) : await roadmapApi.createPath(payload as never);
    return res!.id;
  });

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = { ...values, currentLevel: Number(values.currentLevel), targetLevel: Number(values.targetLevel) };
    const result = (path ? pathUpdateSchema : pathCreateSchema).safeParse(payload);
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
      <Field label={t("fields.goal")} error={errors.goal}>
        <input className={input} value={values.goal} onChange={set("goal")} dir="auto" />
      </Field>
      <Field label={t("fields.description")} error={errors.description}>
        <textarea className={input} rows={3} value={values.description} onChange={set("description")} dir="auto" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("fields.currentLevel")} error={errors.currentLevel}>
          <select className={input} value={values.currentLevel} onChange={set("currentLevel")}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{t(`levels.${l}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={t("fields.targetLevel")} error={errors.targetLevel}>
          <select className={input} value={values.targetLevel} onChange={set("targetLevel")}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{t(`levels.${l}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={t("fields.startDate")} error={errors.startDate}>
          <input type="date" className={input} value={values.startDate} onChange={set("startDate")} />
        </Field>
        <Field label={t("fields.targetDate")} error={errors.targetDate}>
          <input type="date" className={input} value={values.targetDate} onChange={set("targetDate")} />
        </Field>
      </div>
      {path && (
        <Field label={t("fields.status")} error={errors.status}>
          <select className={input} value={values.status} onChange={set("status")}>
            {PATH_STATUSES.map((s) => (
              <option key={s} value={s}>{t(`pathStatus.${s}`)}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnSecondary} onClick={onCancel}>{t("common.cancel")}</button>
        <button type="submit" className={btnPrimary} disabled={mutation.isPending}>
          {mutation.isPending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}
