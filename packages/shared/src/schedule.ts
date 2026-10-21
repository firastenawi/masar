/**
 * حسابات المواعيد بالمنطقة الزمنية للمستخدم، بلا مكتبات:
 * Intl يعطينا "كم الساعة الآن في دمشق" مثلاً، ومنه نحسب الفرق عن UTC (مع التوقيت الصيفي).
 */

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = الأحد
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
  };
}

/** الفرق (بالمللي ثانية) بين الوقت المحلي و UTC في لحظة معيّنة */
function offsetAt(instant: number, timeZone: string): number {
  const p = localParts(new Date(instant), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(instant / 60_000) * 60_000;
}

/** اللحظة (UTC) التي تقابل تاريخاً ووقتاً محليين في منطقة زمنية */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let instant = guess - offsetAt(guess, timeZone);
  // إعادة الحساب مرة: لو عبرنا حدّ التوقيت الصيفي بين التخمين والنتيجة
  instant = guess - offsetAt(instant, timeZone);
  return new Date(instant);
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

/**
 * الموعد القادم لتذكير يتكرر في أيام معيّنة بوقت محلي ثابت، بعد لحظة معيّنة (حصرياً).
 * يبحث 8 أيام للأمام (يكفي لأي مجموعة أيام غير فارغة).
 */
export function nextOccurrence(after: Date, time: string, days: readonly number[], timeZone: string): Date | null {
  if (days.length === 0) return null;
  const minutes = toMinutes(time);
  const start = localParts(after, timeZone);
  for (let i = 0; i < 8; i++) {
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + i));
    if (!days.includes(date.getUTCDay())) continue;
    const candidate = zonedTimeToUtc(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      Math.floor(minutes / 60),
      minutes % 60,
      timeZone,
    );
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  return null;
}

/** هل اللحظة ضمن ساعات الهدوء؟ (تدعم الفترات العابرة لمنتصف الليل) */
export function isQuietTime(instant: Date, quietStart: string, quietEnd: string, timeZone: string): boolean {
  const start = toMinutes(quietStart);
  const end = toMinutes(quietEnd);
  if (start === end) return false;
  const p = localParts(instant, timeZone);
  const now = p.hour * 60 + p.minute;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** نهاية فترة الهدوء الحالية (أول لحظة يُسمح فيها بالإشعار) */
export function quietEndAfter(instant: Date, quietEnd: string, timeZone: string): Date {
  return nextOccurrence(instant, quietEnd, [0, 1, 2, 3, 4, 5, 6], timeZone)!;
}
