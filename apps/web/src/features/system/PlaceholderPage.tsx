import { useTranslation } from "react-i18next";

export function PlaceholderPage({ titleKey }: { titleKey: `nav.${string}` }) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">{t(titleKey)}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">{t("placeholder.comingSoon")}</p>
    </div>
  );
}
