import { addDays } from "./dates";
import type { Streak } from "./schemas/sessions";

/**
 * سلسلة الاستمرارية من أيام التعلم (YYYY-MM-DD بتوقيت المستخدم).
 *
 * - السلسلة الحالية تُعدّ للخلف من اليوم، أو من الأمس إذا لم تُسجَّل جلسة اليوم بعد،
 *   حتى لا تظهر "منكسرة" صباحاً قبل أن تبدأ.
 * - الأيام المستقبلية (بسبب خطأ في الساعة مثلاً) تُتجاهل.
 */
export function computeStreak(days: Iterable<string>, today: string): Streak {
  const set = new Set([...days].filter((d) => d <= today));
  const activeToday = set.has(today);

  let current = 0;
  let cursor = activeToday ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  for (const day of set) {
    if (set.has(addDays(day, -1))) continue; // ليست بداية سلسلة
    let length = 1;
    while (set.has(addDays(day, length))) length += 1;
    longest = Math.max(longest, length);
  }

  return { current, longest, activeToday };
}
