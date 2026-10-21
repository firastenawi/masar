import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { TimerBar } from "../features/sessions/TimerBar";
import { navItems } from "./nav";

const linkBase = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const linkIdle = "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";
const linkActive = "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-100";

export function Layout() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full">
      {/* الشريط الجانبي: يظهر على اليمين تلقائياً بسبب dir="rtl" */}
      <aside className="hidden w-60 shrink-0 flex-col border-e border-slate-200 bg-white p-4 md:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 px-3">
          <div className="text-2xl font-bold text-brand-700 dark:text-brand-100">{t("app.name")}</div>
          <div className="text-xs text-slate-500">{t("app.tagline")}</div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
            >
              <span aria-hidden className="w-5 text-center">{item.icon}</span>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto px-4 pb-24 md:px-8 md:pb-8">
        <TimerBar />
        <div className="pt-6">
          <Outlet />
        </div>
      </main>

      {/* الشريط السفلي على الهاتف */}
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-slate-200 bg-white md:hidden dark:border-slate-800 dark:bg-slate-900">
        {navItems
          .filter((item) => item.mobile)
          .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                  isActive ? "text-brand-700 dark:text-brand-100" : "text-slate-500"
                }`
              }
            >
              <span aria-hidden className="text-lg leading-none">{item.icon}</span>
              {t(item.labelKey)}
            </NavLink>
          ))}
      </nav>
    </div>
  );
}
