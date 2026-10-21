import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

// ───────── أنماط مشتركة ─────────

export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
export const btnPrimary = `${btn} bg-brand-700 text-white hover:bg-brand-600`;
export const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`;
export const btnDanger = `${btn} text-red-600 hover:bg-red-50 dark:hover:bg-red-950`;
export const iconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none dark:hover:bg-slate-800 dark:hover:text-slate-100";
export const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-brand-900";
export const card = "rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";

// ───────── المكونات ─────────

export function Field({
  label,
  error,
  children,
  className = "",
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function FormError({ message }: { message?: string | null | undefined }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  );
}

export function ProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 ${className}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all ${percent === 100 ? "bg-emerald-500" : "bg-brand-600"}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "red" | "amber" | "green" | "blue" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    blue: "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-100",
  };
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

/** نافذة منبثقة مبنية على <dialog>: تدعم Esc والتركيز تلقائياً */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // autoFocus في React لا يعمل داخل <dialog>، فيذهب التركيز لزر الإغلاق؛ نركّز أول حقل بأنفسنا
      dialog.querySelector<HTMLElement>("input, textarea, select")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40 dark:bg-slate-900 dark:text-slate-100"
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" className={iconBtn} onClick={onClose} aria-label={t("common.close")}>
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className={`${card} flex flex-col items-center gap-2 px-6 py-12 text-center`}>
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
