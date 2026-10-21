import { z } from "zod";

// ───────── القيم الثابتة ─────────

export const PATH_STATUSES = ["active", "paused", "completed"] as const;
export const TASK_STATUSES = ["not_started", "in_progress", "done", "postponed"] as const;
export const TASK_TYPES = ["lesson", "reading", "practice", "project", "quiz", "other"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high"] as const;

export type PathStatus = (typeof PATH_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// ───────── أدوات مساعدة للحقول ─────────

/** حقول النماذج الفارغة تُرسل كنص فارغ؛ نحوّلها إلى null */
const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `الحد الأقصى ${max} حرف`).nullable()).optional();

const optionalDate = z
  .preprocess(emptyToNull, z.iso.date({ error: "تاريخ غير صالح" }).nullable())
  .optional();

const title = z
  .string({ error: "العنوان مطلوب" })
  .trim()
  .min(1, "العنوان مطلوب")
  .max(200, "العنوان طويل جداً");

const level = z.number().int().min(1, "المستوى بين 1 و5").max(5, "المستوى بين 1 و5");

function datesInOrder(d: { startDate?: string | null; targetDate?: string | null }) {
  return !d.startDate || !d.targetDate || d.startDate <= d.targetDate;
}
const datesInOrderIssue = {
  message: "الموعد المستهدف يجب أن يكون بعد تاريخ البداية",
  path: ["targetDate"],
};

// ───────── المسارات ─────────

const pathFields = {
  title,
  description: optionalText(2000),
  goal: optionalText(1000),
  currentLevel: level,
  targetLevel: level,
  startDate: optionalDate,
  targetDate: optionalDate,
  status: z.enum(PATH_STATUSES),
};

export const pathCreateSchema = z
  .object({
    ...pathFields,
    currentLevel: level.default(1),
    targetLevel: level.default(3),
    status: z.enum(PATH_STATUSES).default("active"),
  })
  .refine(datesInOrder, datesInOrderIssue);

/** التعديل جزئي: لا قيم افتراضية حتى لا نكتب فوق بيانات لم يرسلها المستخدم */
export const pathUpdateSchema = z.object(pathFields).partial().refine(datesInOrder, datesInOrderIssue);

export type PathCreateInput = z.input<typeof pathCreateSchema>;
export type PathUpdateInput = z.input<typeof pathUpdateSchema>;

// ───────── المهارات المستهدفة ─────────

const skillFields = {
  name: z.string().trim().min(1, "اسم المهارة مطلوب").max(120, "الاسم طويل جداً"),
  targetLevel: level,
};
export const skillCreateSchema = z.object({ ...skillFields, targetLevel: level.default(3) });
export const skillUpdateSchema = z.object(skillFields).partial();

// ───────── المراحل ─────────

const stageFields = {
  title,
  description: optionalText(2000),
  targetDate: optionalDate,
};
export const stageCreateSchema = z.object(stageFields);
export const stageUpdateSchema = z.object(stageFields).partial();

export type StageCreateInput = z.input<typeof stageCreateSchema>;

// ───────── المهام ─────────

const taskFields = {
  title,
  description: optionalText(4000),
  type: z.enum(TASK_TYPES),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  difficulty: z.number().int().min(1).max(5),
  /** وزن المهمة في حساب نسبة الإنجاز: مشروع كبير قد يساوي 5 دروس */
  weight: z.number().int().min(1, "الوزن بين 1 و10").max(10, "الوزن بين 1 و10"),
  estimateMinutes: z.number().int().min(1).max(10_000).nullable().optional(),
  dueDate: optionalDate,
  notes: optionalText(4000),
};

export const taskCreateSchema = z.object({
  ...taskFields,
  type: z.enum(TASK_TYPES).default("lesson"),
  status: z.enum(TASK_STATUSES).default("not_started"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  difficulty: taskFields.difficulty.default(2),
  weight: taskFields.weight.default(1),
});

export const taskUpdateSchema = z
  .object({
    ...taskFields,
    /** نقل المهمة إلى مرحلة أخرى في نفس المسار */
    stageId: z.string().min(1),
  })
  .partial();

export const taskPostponeSchema = z.object({
  until: z.iso.date({ error: "اختر تاريخاً صالحاً" }),
  reason: optionalText(500),
});

export type TaskCreateInput = z.input<typeof taskCreateSchema>;
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>;

// ───────── الترتيب ─────────

export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
});

// ───────── أشكال الردود ─────────

export const idResponseSchema = z.object({ id: z.string() });

export const progressSchema = z.object({
  taskCount: z.number().int(),
  doneCount: z.number().int(),
  /** النسبة الموزونة بأوزان المهام (0–100) */
  percent: z.number().int(),
  byStatus: z.object({
    not_started: z.number().int(),
    in_progress: z.number().int(),
    done: z.number().int(),
    postponed: z.number().int(),
  }),
});

export const taskSchema = z.object({
  id: z.string(),
  stageId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.enum(TASK_TYPES),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  difficulty: z.number().int(),
  weight: z.number().int(),
  estimateMinutes: z.number().int().nullable(),
  /** مجموع دقائق جلسات التعلم المرتبطة بالمهمة (الوقت الفعلي) */
  actualMinutes: z.number().int(),
  dueDate: z.string().nullable(),
  completedAt: z.string().nullable(),
  notes: z.string().nullable(),
  sortOrder: z.number().int(),
  isOverdue: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const stageSchema = z.object({
  id: z.string(),
  pathId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  targetDate: z.string().nullable(),
  sortOrder: z.number().int(),
  progress: progressSchema,
  tasks: z.array(taskSchema),
});

export const skillSchema = z.object({
  id: z.string(),
  pathId: z.string(),
  name: z.string(),
  targetLevel: z.number().int(),
  sortOrder: z.number().int(),
});

export const pathSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  goal: z.string().nullable(),
  currentLevel: z.number().int(),
  targetLevel: z.number().int(),
  startDate: z.string().nullable(),
  targetDate: z.string().nullable(),
  status: z.enum(PATH_STATUSES),
  sortOrder: z.number().int(),
  progress: progressSchema,
  overdueCount: z.number().int(),
  /** أقرب موعد استحقاق لمهمة لم تكتمل */
  nextDueDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const pathDetailSchema = pathSummarySchema.extend({
  stages: z.array(stageSchema),
  skills: z.array(skillSchema),
});

export const pathListSchema = z.array(pathSummarySchema);

export const CHANGE_ACTIONS = ["create", "update", "archive", "reorder", "postpone"] as const;
export const ENTITY_TYPES = ["path", "stage", "task", "skill"] as const;
export const CHANGE_SOURCES = ["user", "ai"] as const;

export const changeLogEntrySchema = z.object({
  id: z.string(),
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string(),
  /** اسم العنصر وقت التغيير، حتى يبقى السجل مفهوماً بعد تعديل العنوان أو الأرشفة */
  entityTitle: z.string(),
  action: z.enum(CHANGE_ACTIONS),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  source: z.enum(CHANGE_SOURCES),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

export const changeLogListSchema = z.array(changeLogEntrySchema);

export type Progress = z.infer<typeof progressSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type PathSummary = z.infer<typeof pathSummarySchema>;
export type PathDetail = z.infer<typeof pathDetailSchema>;
export type ChangeLogEntry = z.infer<typeof changeLogEntrySchema>;
export type ChangeAction = (typeof CHANGE_ACTIONS)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];
export type ChangeSource = (typeof CHANGE_SOURCES)[number];
