import { z } from "zod";
import { pathSummarySchema, taskSchema } from "./roadmap";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `الحد الأقصى ${max} حرف`).nullable()).optional();

const optionalId = z.preprocess(emptyToNull, z.string().min(1).nullable()).optional();

// ───────── جلسات التعلم (سجل التعلم) ─────────

const sessionFields = {
  pathId: optionalId,
  taskId: optionalId,
  /** وقت البداية بتوقيت UTC بصيغة ISO */
  startedAt: z.iso.datetime({ error: "وقت البداية غير صالح" }),
  durationMinutes: z
    .number({ error: "المدة مطلوبة" })
    .int("المدة بالدقائق الكاملة")
    .min(1, "المدة دقيقة واحدة على الأقل")
    .max(1440, "المدة لا تتجاوز 24 ساعة"),
  topics: optionalText(1000),
  resources: optionalText(2000),
  notes: optionalText(10_000),
  problems: optionalText(4000),
  solutions: optionalText(4000),
  accomplished: optionalText(4000),
  reviewLater: optionalText(2000),
};

export const sessionCreateSchema = z.object({
  ...sessionFields,
  /** تحديد المهمة المرتبطة كمكتملة مع حفظ الجلسة */
  completeTask: z.boolean().optional(),
});

export const sessionUpdateSchema = z.object(sessionFields).partial();

export const sessionListQuerySchema = z.object({
  pathId: z.string().min(1).optional(),
  reviewOnly: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type SessionCreateInput = z.input<typeof sessionCreateSchema>;
export type SessionUpdateInput = z.input<typeof sessionUpdateSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  pathId: z.string().nullable(),
  pathTitle: z.string().nullable(),
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  startedAt: z.string(),
  /** يوم الجلسة بتوقيت المستخدم وقت تسجيلها؛ أساس حساب السلسلة */
  localDate: z.string(),
  durationMinutes: z.number().int(),
  topics: z.string().nullable(),
  resources: z.string().nullable(),
  notes: z.string().nullable(),
  problems: z.string().nullable(),
  solutions: z.string().nullable(),
  accomplished: z.string().nullable(),
  reviewLater: z.string().nullable(),
  createdAt: z.string(),
});

export const sessionListSchema = z.array(sessionSchema);
export type StudySession = z.infer<typeof sessionSchema>;

// ───────── اليوم ولوحة التحكم ─────────

export const streakSchema = z.object({
  current: z.number().int(),
  longest: z.number().int(),
  /** هل سُجّلت جلسة اليوم؟ إن لم تُسجّل فالسلسلة ما زالت قائمة من الأمس */
  activeToday: z.boolean(),
});
export type Streak = z.infer<typeof streakSchema>;

export const taskWithContextSchema = taskSchema.extend({
  pathId: z.string(),
  pathTitle: z.string(),
  stageTitle: z.string(),
});
export type TaskWithContext = z.infer<typeof taskWithContextSchema>;

export const SUGGESTION_REASONS = ["in_progress", "overdue", "due_today", "high_priority", "next_in_path"] as const;
export type SuggestionReason = (typeof SUGGESTION_REASONS)[number];

export const suggestionSchema = z.object({
  task: taskWithContextSchema,
  reason: z.enum(SUGGESTION_REASONS),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const todayResponseSchema = z.object({
  today: z.string(),
  streak: streakSchema,
  minutesToday: z.number().int(),
  suggestion: suggestionSchema.nullable(),
  overdue: z.array(taskWithContextSchema),
  dueToday: z.array(taskWithContextSchema),
  inProgress: z.array(taskWithContextSchema),
  upcoming: z.array(taskWithContextSchema),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;

export const dashboardResponseSchema = z.object({
  today: z.string(),
  streak: streakSchema,
  minutesToday: z.number().int(),
  minutesLast7Days: z.number().int(),
  tasksDoneLast7Days: z.number().int(),
  overdueCount: z.number().int(),
  /** دقائق التعلم في آخر 8 فترات من 7 أيام، من الأقدم للأحدث */
  weeklyMinutes: z.array(z.object({ start: z.string(), end: z.string(), minutes: z.number().int() })),
  suggestion: suggestionSchema.nullable(),
  upcoming: z.array(taskWithContextSchema),
  paths: z.array(pathSummarySchema),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
