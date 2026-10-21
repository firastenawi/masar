import { useTranslation } from "react-i18next";
import { formatMinutes } from "@masar/shared";
import { formatShortDate } from "../../lib/format";

interface Bucket {
  start: string;
  end: string;
  minutes: number;
}

const CHART_HEIGHT = 160;

/**
 * أعمدة دقائق التعلم لآخر 8 أسابيع (سلسلة واحدة، لون العلامة التجارية).
 * - أعمدة رفيعة بحواف علوية مستديرة 4px مثبتة على خط الأساس، وفاصل بينها.
 * - تلميح عند المرور أو التركيز على كل عمود، وقيمة مكتوبة على آخر عمود فقط.
 * - جدول مخفي بصرياً لقارئات الشاشة.
 */
export function WeeklyChart({ buckets }: { buckets: Bucket[] }) {
  const { t } = useTranslation();
  const max = Math.max(...buckets.map((b) => b.minutes), 60);
  const range = (b: Bucket) => `${formatShortDate(b.start)} – ${formatShortDate(b.end)}`;

  return (
    <figure className="space-y-2">
      <div className="relative" style={{ height: CHART_HEIGHT }} aria-hidden>
        {/* خط مرجعي خافت عند أعلى قيمة */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-200 dark:border-slate-800" />
        <span className="absolute -top-2.5 start-0 bg-white px-1 text-[10px] text-slate-400 dark:bg-slate-900">
          {formatMinutes(max)}
        </span>
        <div className="absolute inset-0 flex items-end gap-0.5 border-b border-slate-300 dark:border-slate-700">
          {buckets.map((bucket, i) => {
            const height = bucket.minutes === 0 ? 0 : Math.max(3, (bucket.minutes / max) * CHART_HEIGHT);
            const isLast = i === buckets.length - 1;
            return (
              <div key={bucket.end} className="group relative flex h-full flex-1 items-end justify-center" tabIndex={0}>
                {isLast && bucket.minutes > 0 && (
                  <span className="absolute text-xs font-semibold text-slate-700 dark:text-slate-200" style={{ bottom: height + 4 }}>
                    {formatMinutes(bucket.minutes)}
                  </span>
                )}
                <div
                  className={`w-full max-w-9 rounded-t ${isLast ? "bg-brand-600 dark:bg-brand-100" : "bg-brand-600/60 dark:bg-brand-100/60"} group-hover:bg-brand-700 dark:group-hover:bg-white`}
                  style={{ height }}
                />
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block group-focus:block dark:bg-slate-100 dark:text-slate-900">
                  {range(bucket)}: {formatMinutes(bucket.minutes)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-0.5 text-center text-[10px] text-slate-400" aria-hidden>
        {buckets.map((bucket) => (
          <span key={bucket.end} className="flex-1 truncate">{formatShortDate(bucket.end)}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t("dashboard.chartTitle")}</caption>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.end}>
              <th scope="row">{range(bucket)}</th>
              <td>{formatMinutes(bucket.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
