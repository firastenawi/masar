import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { stageCreateSchema, type Stage } from "@masar/shared";
import { Field, FormError, btnPrimary, btnSecondary, input } from "../../components/ui";
import { fieldErrors, type FieldErrors } from "../../lib/forms";
import { roadmapApi, useRoadmapMutation } from "./api";

export function StageForm({
  pathId,
  stage,
  onDone,
}: {
  pathId: string;
  stage?: Stage;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState({
    title: stage?.title ?? "",
    description: stage?.description ?? "",
    targetDate: stage?.targetDate ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useRoadmapMutation((payload: typeof values) =>
    stage ? roadmapApi.updateStage(stage.id, payload) : roadmapApi.createStage(pathId, payload),
  );

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = stageCreateSchema.safeParse(values);
    if (!result.success) return setErrors(fieldErrors(result.error));
    setErrors({});
    mutation.mutate(values, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={mutation.error?.message} />
      <Field label={t("fields.title")} error={errors.title}>
        <input className={input} value={values.title} onChange={set("title")} dir="auto" autoFocus maxLength={200} />
      </Field>
      <Field label={t("fields.description")} error={errors.description}>
        <textarea className={input} rows={3} value={values.description} onChange={set("description")} dir="auto" />
      </Field>
      <Field label={t("fields.targetDate")} error={errors.targetDate}>
        <input type="date" className={input} value={values.targetDate} onChange={set("targetDate")} />
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
