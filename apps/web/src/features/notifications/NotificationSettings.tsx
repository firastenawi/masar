import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  notificationStatusSchema,
  reminderCreateSchema,
  reminderSchema,
  type NotificationSettings as Settings,
  type Reminder,
} from "@masar/shared";
import { Badge, Field, FormError, btnPrimary, btnSecondary, card, iconBtn, input } from "../../components/ui";
import { apiGet, apiSend } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useRoadmapMutation } from "../paths/api";
import { currentSubscription, disablePush, enablePush, pushSupport } from "./push-client";

const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6] as const;

function useNotificationStatus() {
  return useQuery({ queryKey: ["notifications"], queryFn: () => apiGet("/api/notifications/status", notificationStatusSchema) });
}

function useReminders() {
  return useQuery({ queryKey: ["reminders"], queryFn: () => apiGet("/api/reminders", z.array(reminderSchema)) });
}

// ───────── الجهاز والإعدادات ─────────

export function NotificationsSection() {
  const { t } = useTranslation();
  const status = useNotificationStatus();
  const support = pushSupport();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (support !== "supported") return setSubscribed(false);
    currentSubscription().then((s) => setSubscribed(Boolean(s)), () => setSubscribed(false));
  }, [support]);

  const enable = useRoadmapMutation(async () => {
    setError(null);
    try {
      await enablePush(status.data!.vapidPublicKey);
      setSubscribed(true);
    } catch (e) {
      setError((e as Error).message === "PERMISSION_DENIED" ? t("notifications.denied") : (e as Error).message);
    }
  });
  const disable = useRoadmapMutation(async () => {
    await disablePush();
    setSubscribed(false);
  });
  const test = useRoadmapMutation(() =>
    apiSend("POST", "/api/notifications/test", undefined, z.object({ delivered: z.number(), errors: z.array(z.string()) })),
  );

  return (
    <section className={`${card} space-y-4 p-5`}>
      <h2 className="font-semibold">{t("notifications.title")}</h2>

      {support !== "supported" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {t(`notifications.support.${support}`)}
        </p>
      )}

      {status.data && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone={subscribed ? "green" : "slate"}>
            {subscribed ? t("notifications.thisDeviceOn") : t("notifications.thisDeviceOff")}
          </Badge>
          <Badge>{t("notifications.devices", { count: status.data.devices })}</Badge>
          <Badge>{t("notifications.sentToday", { sent: status.data.sentToday, max: status.data.settings.maxPerDay })}</Badge>
        </div>
      )}

      <FormError message={error ?? enable.error?.message ?? test.error?.message} />
      {test.data && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {test.data.delivered > 0 ? t("notifications.testSent", { count: test.data.delivered }) : t("notifications.testNone")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {support === "supported" && !subscribed && (
          <button className={btnPrimary} disabled={enable.isPending || !status.data} onClick={() => enable.mutate(undefined)}>
            🔔 {t("notifications.enable")}
          </button>
        )}
        {subscribed && (
          <button className={btnSecondary} disabled={disable.isPending} onClick={() => disable.mutate(undefined)}>
            {t("notifications.disable")}
          </button>
        )}
        <button className={btnSecondary} disabled={test.isPending || !status.data?.devices} onClick={() => test.mutate(undefined)}>
          {t("notifications.test")}
        </button>
      </div>

      {status.data && <SettingsForm settings={status.data.settings} />}

      {status.data && status.data.recent.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">{t("notifications.recent")}</summary>
          <ul className="mt-2 space-y-1.5">
            {status.data.recent.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={entry.status === "sent" ? "green" : entry.status === "failed" ? "red" : "slate"}>
                  {t(`notifications.status.${entry.status}`)}
                </Badge>
                <span className="font-medium" dir="auto">{entry.title}</span>
                {entry.detail && entry.status !== "sent" && <span className="text-slate-500" dir="auto">— {entry.detail}</span>}
                <span className="ms-auto text-slate-400">{formatDateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const { t } = useTranslation();
  const [values, setValues] = useState({ ...settings, maxPerDay: String(settings.maxPerDay) });
  const [saved, setSaved] = useState(false);
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const save = useRoadmapMutation((body: Partial<Settings>) => apiSend("PATCH", "/api/notifications/settings", body));

  function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    save.mutate({ ...values, maxPerDay: Number(values.maxPerDay) }, { onSuccess: () => setSaved(true) });
  }
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t("notifications.quietStart")}>
          <input type="time" className={input} value={values.quietStart} onChange={set("quietStart")} />
        </Field>
        <Field label={t("notifications.quietEnd")}>
          <input type="time" className={input} value={values.quietEnd} onChange={set("quietEnd")} />
        </Field>
        <Field label={t("notifications.maxPerDay")}>
          <input type="number" min={1} max={20} className={input} value={values.maxPerDay} onChange={set("maxPerDay")} />
        </Field>
      </div>
      <Field label={t("notifications.timeZone")}>
        <div className="flex gap-2">
          <input className={input} value={values.timeZone} onChange={set("timeZone")} dir="ltr" />
          {deviceZone !== values.timeZone && (
            <button type="button" className={btnSecondary} onClick={() => setValues((v) => ({ ...v, timeZone: deviceZone }))}>
              {t("notifications.useDeviceZone", { zone: deviceZone })}
            </button>
          )}
        </div>
      </Field>
      <FormError message={save.error?.message} />
      <div className="flex items-center gap-3">
        <button type="submit" className={btnPrimary} disabled={save.isPending}>{t("common.save")}</button>
        {saved && <span className="text-sm text-emerald-600">✓</span>}
      </div>
    </form>
  );
}

// ───────── التذكيرات ─────────

export function RemindersSection() {
  const { t } = useTranslation();
  const reminders = useReminders();

  return (
    <section className={`${card} space-y-4 p-5`}>
      <h2 className="font-semibold">{t("reminders.title")}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">{t("reminders.intro")}</p>
      {reminders.isPending && <p className="text-slate-500">{t("common.loading")}</p>}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {reminders.data?.map((reminder) => <ReminderRow key={reminder.id} reminder={reminder} />)}
      </ul>
      <NewReminderForm />
    </section>
  );
}

function DayChips({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1" role="group" aria-label={t("reminders.days")}>
      {DAY_KEYS.map((day) => {
        const active = days.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={active}
            title={t(`reminders.dayNames.${day}`)}
            onClick={() => onChange(active ? days.filter((d) => d !== day) : [...days, day])}
            className={`h-8 w-8 rounded-full text-xs font-medium ${
              active ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
            }`}
          >
            {t(`reminders.dayShort.${day}`)}
          </button>
        );
      })}
    </div>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(reminder.title);
  const update = useRoadmapMutation((patch: Partial<Reminder>) => apiSend("PATCH", `/api/reminders/${reminder.id}`, patch));
  const remove = useRoadmapMutation(() => apiSend("DELETE", `/api/reminders/${reminder.id}`));

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-700"
            checked={reminder.enabled}
            onChange={(e) => update.mutate({ enabled: e.target.checked })}
            aria-label={t("reminders.enabled")}
          />
        </label>
        <input
          className={`${input} w-auto min-w-0 flex-1`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== reminder.title && update.mutate({ title: title.trim() })}
          dir="auto"
          aria-label={t("fields.title")}
        />
        <input
          type="time"
          className={`${input} w-28`}
          value={reminder.time}
          onChange={(e) => e.target.value && update.mutate({ time: e.target.value })}
          aria-label={t("reminders.time")}
        />
        <button
          className={iconBtn}
          aria-label={t("common.archive")}
          onClick={() => window.confirm(t("reminders.confirmDelete", { title: reminder.title })) && remove.mutate(undefined)}
        >
          🗑
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 ps-7">
        <DayChips days={reminder.days} onChange={(days) => days.length > 0 && update.mutate({ days })} />
        <Badge>{t(`reminders.kinds.${reminder.kind}`)}</Badge>
        <span className="text-xs text-slate-400">
          {reminder.enabled && reminder.nextFireAt ? `${t("reminders.next")}: ${formatDateTime(reminder.nextFireAt)}` : t("reminders.off")}
        </span>
      </div>
      {update.error && <p className="ps-7 text-xs text-red-600">{update.error.message}</p>}
    </li>
  );
}

function NewReminderForm() {
  const { t } = useTranslation();
  const [values, setValues] = useState({ title: "", body: "", time: "18:00", days: [0, 1, 2, 3, 4, 5, 6] });
  const [error, setError] = useState<string | null>(null);
  const create = useRoadmapMutation((body: object) => apiSend("POST", "/api/reminders", body));

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = { kind: "custom" as const, ...values, body: values.body || null };
    const parsed = reminderCreateSchema.safeParse(payload);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? null);
    setError(null);
    create.mutate(payload, { onSuccess: () => setValues((v) => ({ ...v, title: "", body: "" })) });
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
      <p className="text-sm font-medium">{t("reminders.add")}</p>
      <div className="flex flex-wrap gap-2">
        <input className={`${input} min-w-40 flex-1`} value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} placeholder={t("reminders.titlePlaceholder")} dir="auto" maxLength={120} />
        <input type="time" className={`${input} w-28`} value={values.time} onChange={(e) => setValues((v) => ({ ...v, time: e.target.value }))} aria-label={t("reminders.time")} />
      </div>
      <input className={input} value={values.body} onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))} placeholder={t("reminders.bodyPlaceholder")} dir="auto" maxLength={500} />
      <DayChips days={values.days} onChange={(days) => setValues((v) => ({ ...v, days }))} />
      <FormError message={error ?? create.error?.message} />
      <button type="submit" className={btnSecondary} disabled={create.isPending}>＋ {t("reminders.add")}</button>
    </form>
  );
}
