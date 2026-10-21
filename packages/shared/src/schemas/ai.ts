import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "./roadmap";

// ───────── عمليات التعديل التي يقترحها المساعد ─────────
// مجموعة صغيرة ومحددة عمداً: المساعد لا يحذف ولا يؤرشف شيئاً،
// وكل عملية تمرّ بنفس التحقق ونفس سجل التغييرات كأي تعديل يدوي.

const isoDate = z.iso.date();
const text = (max: number) => z.string().trim().min(1).max(max);

export const proposalOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create_stage"),
    /** معرّف مؤقت يمكن لعمليات create_task اللاحقة الإشارة إليه */
    ref: z.string().min(1).max(40).nullish(),
    pathId: z.string().min(1),
    title: text(200),
    description: z.string().max(2000).nullish(),
    targetDate: isoDate.nullish(),
  }),
  z.object({
    op: z.literal("create_task"),
    stageId: z.string().min(1).nullish(),
    stageRef: z.string().min(1).max(40).nullish(),
    title: text(200),
    description: z.string().max(4000).nullish(),
    type: z.enum(TASK_TYPES).nullish(),
    priority: z.enum(TASK_PRIORITIES).nullish(),
    estimateMinutes: z.number().int().min(1).max(10_000).nullish(),
    dueDate: isoDate.nullish(),
    weight: z.number().int().min(1).max(10).nullish(),
  }),
  z.object({
    op: z.literal("update_task"),
    taskId: z.string().min(1),
    title: text(200).nullish(),
    status: z.enum(TASK_STATUSES).nullish(),
    priority: z.enum(TASK_PRIORITIES).nullish(),
    dueDate: isoDate.nullish(),
    estimateMinutes: z.number().int().min(1).max(10_000).nullish(),
  }),
  z.object({
    op: z.literal("postpone_task"),
    taskId: z.string().min(1),
    until: isoDate,
    reason: z.string().max(500).nullish(),
  }),
  z.object({
    op: z.literal("update_path"),
    pathId: z.string().min(1),
    goal: z.string().max(1000).nullish(),
    targetDate: isoDate.nullish(),
  }),
]);

export type ProposalOperation = z.infer<typeof proposalOperationSchema>;

export const proposalDraftSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  operations: z.array(proposalOperationSchema).min(1).max(30),
});
export type ProposalDraft = z.infer<typeof proposalDraftSchema>;

/** شكل رد المساعد: نص للمستخدم + اقتراح تعديل اختياري */
export const assistantReplySchema = z.object({
  reply: z.string().min(1),
  proposal: proposalDraftSchema.nullish(),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;

// ───────── المحادثات ─────────

export const PROPOSAL_STATUSES = ["pending", "applied", "rejected", "failed"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const proposalSchema = z.object({
  id: z.string(),
  summary: z.string(),
  operations: z.array(proposalOperationSchema),
  status: z.enum(PROPOSAL_STATUSES),
  error: z.string().nullable(),
  decidedAt: z.string().nullable(),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const aiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
  proposal: proposalSchema.nullable(),
});
export type AiMessage = z.infer<typeof aiMessageSchema>;

export const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  pathId: z.string().nullable(),
  pathTitle: z.string().nullable(),
  updatedAt: z.string(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationDetailSchema = conversationSummarySchema.extend({
  messages: z.array(aiMessageSchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const conversationCreateSchema = z.object({
  pathId: z.string().min(1).nullish(),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "اكتب سؤالك").max(8000, "الرسالة طويلة جداً"),
});

export const aiStatusSchema = z.object({
  provider: z.string(),
  model: z.string().nullable(),
  requestsToday: z.number().int(),
  dailyLimit: z.number().int(),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;
