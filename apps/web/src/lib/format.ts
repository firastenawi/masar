// العربية مع أرقام لاتينية: أوضح في التواريخ والأرقام التقنية
const LOCALE = "ar-u-nu-latn";

const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });

/** تاريخ بصيغة YYYY-MM-DD (بلا وقت، لذلك نعرضه بتوقيت UTC حتى لا يتغيّر اليوم) */
export function formatDate(date: string | null): string {
  return date ? dateFormat.format(new Date(`${date}T00:00:00Z`)) : "—";
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

const shortDateFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });
const longDateFormat = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" });

export function formatShortDate(date: string): string {
  return shortDateFormat.format(new Date(`${date}T00:00:00Z`));
}

/** مثل: الأربعاء، 21 أكتوبر */
export function formatLongDate(date: string): string {
  return longDateFormat.format(new Date(`${date}T00:00:00Z`));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** ISO ← قيمة حقل datetime-local (بتوقيت الجهاز) */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

/** قيمة حقل datetime-local (بتوقيت الجهاز) ← ISO */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** تاريخ اليوم بالتوقيت المحلي للجهاز، بصيغة YYYY-MM-DD */
export function localToday(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
