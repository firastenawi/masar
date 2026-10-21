/**
 * تحويل عدد الدقائق إلى نص عربي مختصر، مثل: "1 س 30 د".
 * يُستخدم في لوحة التحكم وسجل التعلم والتقارير.
 */
export function formatMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    throw new RangeError("عدد الدقائق يجب أن يكون رقماً موجباً");
  }
  const minutes = Math.round(totalMinutes);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} د`;
  if (rest === 0) return `${hours} س`;
  return `${hours} س ${rest} د`;
}
