import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { healthResponseSchema } from "@masar/shared";
import { apiGet } from "../../lib/api";

export function HealthCard() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet("/api/health", healthResponseSchema),
    refetchInterval: 30_000,
  });

  const state = health.isPending ? "checking" : health.isError ? "error" : "ok";
  const dot = { checking: "bg-amber-400", error: "bg-red-500", ok: "bg-emerald-500" }[state];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("health.title")}</h2>
      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${dot}`} aria-hidden />
        <span data-testid="health-status">{t(`health.${state}`)}</span>
      </div>
      {health.data && (
        <p className="mt-2 text-xs text-slate-500">
          {t("health.version")}: <code>{health.data.version}</code>
        </p>
      )}
    </section>
  );
}
