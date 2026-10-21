export interface NavItem {
  path: string;
  /** مفتاح الترجمة في locales/*.json */
  labelKey: `nav.${string}`;
  icon: string;
  /** يظهر في الشريط السفلي على الهاتف */
  mobile: boolean;
}

export const navItems: readonly NavItem[] = [
  { path: "/", labelKey: "nav.dashboard", icon: "◧", mobile: true },
  { path: "/today", labelKey: "nav.today", icon: "☀", mobile: true },
  { path: "/paths", labelKey: "nav.paths", icon: "⛰", mobile: true },
  { path: "/journal", labelKey: "nav.journal", icon: "✎", mobile: true },
  { path: "/assistant", labelKey: "nav.assistant", icon: "✦", mobile: true },
  { path: "/resources", labelKey: "nav.resources", icon: "⧉", mobile: false },
  { path: "/reports", labelKey: "nav.reports", icon: "▤", mobile: false },
  { path: "/settings", labelKey: "nav.settings", icon: "⚙", mobile: false },
];
