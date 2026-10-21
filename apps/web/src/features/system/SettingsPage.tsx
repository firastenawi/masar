import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { backupListSchema, changePasswordSchema } from "@masar/shared";
import { Badge, Field, FormError, btnPrimary, btnSecondary, card, input } from "../../components/ui";
import { apiGet, apiSend } from "../../lib/api";
import { fieldErrors, type FieldErrors } from "../../lib/forms";
import { formatDateTime } from "../../lib/format";
import { useRoadmapMutation } from "../paths/api";
import { NotificationsSection, RemindersSection } from "../notifications/NotificationSettings";
import { HealthCard } from "./HealthCard";

export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t("nav.settings")}</h1>
      <NotificationsSection />
      <RemindersSection />
      <BackupsSection />
      <SecuritySection />
      <MobileSection />
      <HealthCard />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${card} space-y-4 p-5`}>
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function BackupsSection() {
  const { t } = useTranslation();
  const backups = useQuery({ queryKey: ["backups"], queryFn: () => apiGet("/api/backups", backupListSchema) });
  const create = useRoadmapMutation(() => apiSend("POST", "/api/backups"));

  const latest = backups.data?.backups[0];
  const stale = latest ? Date.now() - Date.parse(latest.createdAt) > 2 * 24 * 60 * 60 * 1000 : true;

  return (
    <Section title={t("settings.backups.title")}>
      <p className="text-sm text-slate-600 dark:text-slate-400">{t("settings.backups.intro")}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {latest ? (
          <Badge tone={stale ? "amber" : "green"}>
            {t("settings.backups.latest")}: {formatDateTime(latest.createdAt)}
          </Badge>
        ) : (
          <Badge tone="amber">{t("settings.backups.none")}</Badge>
        )}
        <Badge>{t("settings.backups.count", { count: backups.data?.backups.length ?? 0 })}</Badge>
        <Badge tone={backups.data?.copyDirectory ? "green" : "slate"}>
          {backups.data?.copyDirectory ? t("settings.backups.offsiteOn") : t("settings.backups.offsiteOff")}
        </Badge>
      </div>
      <FormError message={create.error?.message} />
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={() => create.mutate(undefined)} disabled={create.isPending}>
          {t("settings.backups.now")}
        </button>
        {/* رابط عادي: المتصفح يحمّل الملف مباشرة بفضل Content-Disposition */}
        <a className={btnSecondary} href="/api/export" download>
          {t("settings.backups.export")}
        </a>
      </div>
      {backups.data && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">{t("settings.backups.details")}</summary>
          <p className="mt-2 text-xs text-slate-500">
            {t("settings.backups.folder")}: <code>{backups.data.directory}</code>
          </p>
          <ul className="mt-2 space-y-1">
            {backups.data.backups.map((b) => (
              <li key={b.name} className="flex justify-between gap-2 text-xs">
                <code className="truncate">{b.name}</code>
                <span className="shrink-0 text-slate-400">{(b.sizeBytes / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">{t("settings.backups.restoreHint")}</p>
        </details>
      )}
    </Section>
  );
}

function SecuritySection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);

  const change = useRoadmapMutation((body: { currentPassword: string; newPassword: string }) =>
    apiSend("POST", "/api/auth/password", body),
  );
  const logout = useRoadmapMutation(() => apiSend("POST", "/api/auth/logout"));

  function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    const body = { currentPassword: values.currentPassword, newPassword: values.newPassword };
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (values.newPassword !== values.confirm) return setErrors({ confirm: t("auth.mismatch") });
    setErrors({});
    change.mutate(body, {
      onSuccess: () => {
        setValues({ currentPassword: "", newPassword: "", confirm: "" });
        setDone(true);
      },
    });
  }

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <Section title={t("settings.security.title")}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <FormError message={change.error?.message} />
        {done && <p className="text-sm text-emerald-600">{t("settings.security.changed")}</p>}
        <Field label={t("settings.security.current")} error={errors.currentPassword}>
          <input type="password" className={input} value={values.currentPassword} onChange={set("currentPassword")} autoComplete="current-password" dir="ltr" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("auth.newPassword")} error={errors.newPassword}>
            <input type="password" className={input} value={values.newPassword} onChange={set("newPassword")} autoComplete="new-password" dir="ltr" />
          </Field>
          <Field label={t("auth.confirmPassword")} error={errors.confirm}>
            <input type="password" className={input} value={values.confirm} onChange={set("confirm")} autoComplete="new-password" dir="ltr" />
          </Field>
        </div>
        <p className="text-xs text-slate-500">{t("settings.security.othersLoggedOut")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={btnPrimary} disabled={change.isPending}>{t("settings.security.change")}</button>
          <button
            type="button"
            className={btnSecondary}
            onClick={() => logout.mutate(undefined, { onSuccess: () => void queryClient.invalidateQueries() })}
          >
            {t("settings.security.logout")}
          </button>
        </div>
      </form>
    </Section>
  );
}

function MobileSection() {
  const { t } = useTranslation();
  const steps = t("settings.mobile.steps", { returnObjects: true }) as string[];
  return (
    <Section title={t("settings.mobile.title")}>
      <p className="text-sm text-slate-600 dark:text-slate-400">{t("settings.mobile.intro")}</p>
      <ol className="list-decimal space-y-1.5 ps-5 text-sm">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="text-xs text-slate-500">
        <code dir="ltr">tailscale serve --bg 3001</code>
      </p>
    </Section>
  );
}
