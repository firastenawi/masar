import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { taskPostponeSchema, type Task } from "@masar/shared";
import { Field, FormError, btnPrimary, btnSecondary, input } from "../../components/ui";
import { fieldErrors, type FieldErrors } from "../../lib/forms";
import { localToday } from "../../lib/format";
import { roadmapApi, useRoadmapMutation } from "./api";

export function PostponeForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const { t } = useTranslation();
  const [until, setUntil] = useState(localToday(7));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useRoadmapMutation((payload: { until: string; reason: string }) =>
    roadmapApi.postponeTask(task.id, payload),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = { until, reason };
    const result = taskPostponeSchema.safeParse(payload);
    if (!result.success) return setErrors(fieldErrors(result.error));
    setErrors({});
    mutation.mutate(payload, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-slate-600 dark:text-slate-400" dir="auto">{task.title}</p>
      <FormError message={mutation.error?.message} />
      <Field label={t("fields.until")} error={errors.until}>
        <input type="date" className={input} value={until} min={localToday()} onChange={(e) => setUntil(e.target.value)} autoFocus />
      </Field>
      <Field label={`${t("fields.reason")} (${t("common.optional")})`} error={errors.reason}>
        <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} dir="auto" maxLength={500} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnSecondary} onClick={onDone}>{t("common.cancel")}</button>
        <button type="submit" className={btnPrimary} disabled={mutation.isPending}>{t("task.postpone")}</button>
      </div>
    </form>
  );
}
