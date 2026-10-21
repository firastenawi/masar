import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  REMINDER_KINDS,
  PROPOSAL_STATUSES,
  CHANGE_ACTIONS,
  CHANGE_SOURCES,
  ENTITY_TYPES,
  PATH_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
} from "@masar/shared";

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

const timestamps = {
  createdAt: text("created_at").notNull().default(nowIso),
  updatedAt: text("updated_at").notNull().default(nowIso),
  /** حذف ناعم: العنصر يختفي من الواجهة لكنه يبقى في القاعدة والسجل */
  archivedAt: text("archived_at"),
};

/**
 * إعدادات المستخدم بصيغة مفتاح/قيمة (القيمة JSON).
 * مثال: timezone, learning_days, quiet_hours, ai_monthly_budget_usd
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull().default(nowIso),
});

export const learningPaths = sqliteTable(
  "learning_paths",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    goal: text("goal"),
    currentLevel: integer("current_level").notNull().default(1),
    targetLevel: integer("target_level").notNull().default(3),
    startDate: text("start_date"),
    targetDate: text("target_date"),
    status: text("status", { enum: PATH_STATUSES }).notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check("paths_levels_chk", sql`${t.currentLevel} between 1 and 5 and ${t.targetLevel} between 1 and 5`),
  ],
);

export const skills = sqliteTable(
  "skills",
  {
    id: text("id").primaryKey(),
    pathId: text("path_id")
      .notNull()
      .references(() => learningPaths.id),
    name: text("name").notNull(),
    targetLevel: integer("target_level").notNull().default(3),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("skills_path_idx").on(t.pathId)],
);

export const stages = sqliteTable(
  "stages",
  {
    id: text("id").primaryKey(),
    pathId: text("path_id")
      .notNull()
      .references(() => learningPaths.id),
    title: text("title").notNull(),
    description: text("description"),
    targetDate: text("target_date"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("stages_path_idx").on(t.pathId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    stageId: text("stage_id")
      .notNull()
      .references(() => stages.id),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type", { enum: TASK_TYPES }).notNull().default("lesson"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("not_started"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("medium"),
    difficulty: integer("difficulty").notNull().default(2),
    weight: integer("weight").notNull().default(1),
    estimateMinutes: integer("estimate_minutes"),
    dueDate: text("due_date"),
    completedAt: text("completed_at"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("tasks_stage_idx").on(t.stageId),
    index("tasks_due_idx").on(t.dueDate),
    check("tasks_weight_chk", sql`${t.weight} between 1 and 10`),
    check("tasks_difficulty_chk", sql`${t.difficulty} between 1 and 5`),
  ],
);

/**
 * جلسات التعلم: هي نفسها تدوينات "سجل التعلم".
 * الربط بمسار أو مهمة اختياري (جلسة قراءة حرة مثلاً).
 */
export const studySessions = sqliteTable(
  "study_sessions",
  {
    id: text("id").primaryKey(),
    pathId: text("path_id").references(() => learningPaths.id),
    taskId: text("task_id").references(() => tasks.id),
    startedAt: text("started_at").notNull(),
    /**
     * يوم الجلسة بتوقيت المستخدم لحظة تسجيلها. يُخزَّن (رغم إمكانية اشتقاقه)
     * حتى لا تتغيّر أيام الجلسات القديمة والسلسلة إذا غيّر المستخدم منطقته الزمنية لاحقاً.
     */
    localDate: text("local_date").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    topics: text("topics"),
    resources: text("resources"),
    notes: text("notes"),
    problems: text("problems"),
    solutions: text("solutions"),
    accomplished: text("accomplished"),
    reviewLater: text("review_later"),
    ...timestamps,
  },
  (t) => [
    index("sessions_date_idx").on(t.localDate),
    index("sessions_path_idx").on(t.pathId),
    index("sessions_task_idx").on(t.taskId),
    check("sessions_duration_chk", sql`${t.durationMinutes} between 1 and 1440`),
  ],
);

// ───────── جلسات تسجيل الدخول ─────────

/**
 * نخزّن بصمة SHA-256 للرمز فقط، لا الرمز نفسه: لو تسرّبت قاعدة البيانات (نسخة احتياطية مثلاً)
 * لا يمكن استخدام ما فيها لتسجيل الدخول.
 */
export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull().default(nowIso),
  lastSeenAt: text("last_seen_at").notNull().default(nowIso),
  expiresAt: text("expires_at").notNull(),
  userAgent: text("user_agent"),
});

// ───────── التذكيرات والإشعارات ─────────

export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: REMINDER_KINDS }).notNull(),
  title: text("title").notNull(),
  body: text("body"),
  /** الوقت المحلي HH:mm بالمنطقة الزمنية في الإعدادات */
  time: text("time").notNull(),
  /** أيام الأسبوع [0..6]، 0 = الأحد */
  days: text("days", { mode: "json" }).notNull().$type<number[]>(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** الموعد القادم محسوباً مسبقاً بتوقيت UTC؛ التأجيل يقدّمه مؤقتاً */
  nextFireAt: text("next_fire_at"),
  lastFiredAt: text("last_fired_at"),
  ...timestamps,
});

/** اشتراك Web Push لكل جهاز/متصفح */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull().default(nowIso),
  lastSuccessAt: text("last_success_at"),
  failureCount: integer("failure_count").notNull().default(0),
});

/** سجل الإشعارات: للحد اليومي ولمعرفة ما أُرسل أو تُخطّي ولماذا */
export const notificationLog = sqliteTable(
  "notification_log",
  {
    id: text("id").primaryKey(),
    reminderId: text("reminder_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["sent", "skipped", "failed"] }).notNull(),
    detail: text("detail"),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (t) => [index("notification_log_created_idx").on(t.createdAt)],
);

// ───────── المساعد الذكي ─────────

export const aiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  /** محادثة مرتبطة بمسار تحصل على تفاصيله كاملة في السياق */
  pathId: text("path_id").references(() => learningPaths.id),
  ...timestamps,
});

export const aiMessages = sqliteTable(
  "ai_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversations.id),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    /** بيانات الاستخدام لرسائل المساعد فقط */
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** تكلفة تقديرية يبلّغ عنها المزوّد؛ مع اشتراك Claude Code لا تُدفع فعلياً */
    costUsd: real("cost_usd"),
    durationMs: integer("duration_ms"),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (t) => [index("ai_messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const aiProposals = sqliteTable("ai_proposals", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .unique()
    .references(() => aiMessages.id),
  summary: text("summary").notNull(),
  operations: text("operations", { mode: "json" }).notNull().$type<unknown[]>(),
  status: text("status", { enum: PROPOSAL_STATUSES }).notNull().default("pending"),
  error: text("error"),
  decidedAt: text("decided_at"),
  createdAt: text("created_at").notNull().default(nowIso),
});

/**
 * سجل التغييرات المهمة على الخطط: لا يُعدَّل ولا يُحذف.
 * before/after يحتويان الحقول التي تغيّرت فقط.
 */
export const changeLog = sqliteTable(
  "change_log",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type", { enum: ENTITY_TYPES }).notNull(),
    entityId: text("entity_id").notNull(),
    entityTitle: text("entity_title").notNull(),
    /** المسار الذي يتبع له العنصر، لعرض سجل المسار كاملاً باستعلام واحد */
    pathId: text("path_id").notNull(),
    action: text("action", { enum: CHANGE_ACTIONS }).notNull(),
    before: text("before", { mode: "json" }).$type<Record<string, unknown> | null>(),
    after: text("after", { mode: "json" }).$type<Record<string, unknown> | null>(),
    source: text("source", { enum: CHANGE_SOURCES }).notNull().default("user"),
    reason: text("reason"),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (t) => [index("change_log_path_idx").on(t.pathId, t.createdAt)],
);
