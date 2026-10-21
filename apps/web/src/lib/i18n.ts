import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "../locales/ar.json";

export const resources = { ar: { translation: ar } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: "ar",
  fallbackLng: "ar",
  interpolation: { escapeValue: false }, // React يتولى الحماية من XSS
});

export default i18n;
