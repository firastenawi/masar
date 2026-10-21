import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { skillCreateSchema, type Skill } from "@masar/shared";
import { btnPrimary, card, iconBtn, input } from "../../components/ui";
import { roadmapApi, useRoadmapMutation } from "./api";

export function SkillsPanel({ pathId, skills }: { pathId: string; skills: Skill[] }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [targetLevel, setTargetLevel] = useState("3");
  const [error, setError] = useState<string | null>(null);

  const create = useRoadmapMutation((body: { name: string; targetLevel: number }) => roadmapApi.createSkill(pathId, body));
  const update = useRoadmapMutation((v: { id: string; targetLevel: number }) =>
    roadmapApi.updateSkill(v.id, { targetLevel: v.targetLevel }),
  );
  const archive = useRoadmapMutation((id: string) => roadmapApi.archiveSkill(id));

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = { name, targetLevel: Number(targetLevel) };
    const result = skillCreateSchema.safeParse(payload);
    if (!result.success) return setError(result.error.issues[0]?.message ?? null);
    setError(null);
    create.mutate(payload, { onSuccess: () => setName("") });
  }

  return (
    <div className={`${card} space-y-4 p-4`}>
      {skills.length === 0 && <p className="text-sm text-slate-500">{t("skills.empty")}</p>}
      <ul className="space-y-2">
        {skills.map((skill) => (
          <li key={skill.id} className="flex items-center gap-3">
            <span className="flex-1" dir="auto">{skill.name}</span>
            <select
              className={`${input} w-36`}
              value={skill.targetLevel}
              aria-label={t("fields.targetLevel")}
              onChange={(e) => update.mutate({ id: skill.id, targetLevel: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{t(`levels.${l}`)}</option>)}
            </select>
            <button
              className={iconBtn}
              aria-label={t("common.archive")}
              onClick={() => window.confirm(t("skills.confirmArchive", { name: skill.name })) && archive.mutate(skill.id)}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <input className={`${input} min-w-40 flex-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("skills.placeholder")} dir="auto" maxLength={120} />
        <select className={`${input} w-36`} value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} aria-label={t("fields.targetLevel")}>
          {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{t(`levels.${l}`)}</option>)}
        </select>
        <button type="submit" className={btnPrimary} disabled={create.isPending}>{t("skills.add")}</button>
      </form>
      {(error ?? create.error?.message) && <p className="text-sm text-red-600">{error ?? create.error?.message}</p>}
      <p className="text-xs text-slate-400">{t("skills.masteryNote")}</p>
    </div>
  );
}
