import type { z } from "zod";

export type FieldErrors = Record<string, string>;

/** يحوّل أخطاء Zod إلى رسالة واحدة لكل حقل (أول خطأ فقط) */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    out[key] ??= issue.message;
  }
  return out;
}

/** قيمة حقل رقمي اختياري: النص الفارغ يصبح null */
export function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}
