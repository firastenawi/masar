import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  database: z.literal("ok"),
  version: z.string(),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** شكل موحّد لكل أخطاء الـ API: رمز ثابت للبرمجة + رسالة مفهومة للمستخدم */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
