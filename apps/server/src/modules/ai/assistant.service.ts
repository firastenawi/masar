import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import {
  assistantReplySchema,
  proposalOperationSchema,
  type AssistantReply,
  type ConversationDetail,
  type ConversationSummary,
} from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { aiConversations, aiMessages, aiProposals, learningPaths } from "../../db/schema";
import { AppError, notFound } from "../../lib/errors";
import { activePath } from "../roadmap/roadmap.commands";
import { buildContext } from "./context";
import { buildPrompt, REPLY_JSON_SCHEMA, SYSTEM_PROMPT } from "./prompt";
import type { AiProvider } from "./provider";

export interface AssistantDeps {
  db: AppDatabase;
  provider: AiProvider;
  dailyLimit: number;
}

const now = () => new Date().toISOString();

/** عنوان المحادثة من أول سؤال */
function titleFrom(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine;
}

/**
 * يفسّر رد المزوّد: الرد المنظّم أولاً، ثم نص JSON، وإلا نعامل النص كرد عادي بلا اقتراح.
 * الاقتراح غير الصالح يُسقَط بصمت بدل أن يفشل الرد كله.
 */
export function interpretReply(structured: unknown, text: string): AssistantReply {
  const candidates: unknown[] = [structured];
  const fenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    candidates.push(JSON.parse(fenced));
  } catch {
    // ليس JSON
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const full = assistantReplySchema.safeParse(candidate);
    if (full.success) return full.data;
    const reply = (candidate as { reply?: unknown }).reply;
    if (typeof reply === "string" && reply.trim()) return { reply, proposal: null };
  }
  return { reply: text.trim() || "لم أتمكن من صياغة رد، حاول مجدداً.", proposal: null };
}

export function listConversations(db: AppDatabase): ConversationSummary[] {
  return db
    .select({
      id: aiConversations.id,
      title: aiConversations.title,
      pathId: aiConversations.pathId,
      pathTitle: learningPaths.title,
      updatedAt: aiConversations.updatedAt,
    })
    .from(aiConversations)
    .leftJoin(learningPaths, eq(aiConversations.pathId, learningPaths.id))
    .where(isNull(aiConversations.archivedAt))
    .orderBy(desc(aiConversations.updatedAt))
    .all();
}

export function createConversation(db: AppDatabase, pathId: string | null) {
  return db.transaction((tx) => {
    if (pathId) activePath(tx, pathId);
    return tx
      .insert(aiConversations)
      .values({ id: randomUUID(), title: "محادثة جديدة", pathId })
      .returning()
      .get();
  });
}

export function archiveConversation(db: AppDatabase, id: string) {
  const result = db
    .update(aiConversations)
    .set({ archivedAt: now(), updatedAt: now() })
    .where(and(eq(aiConversations.id, id), isNull(aiConversations.archivedAt)))
    .run();
  if (result.changes === 0) throw notFound("المحادثة");
}

export function getConversation(db: AppDatabase, id: string): ConversationDetail {
  const conversation = listConversations(db).find((c) => c.id === id);
  if (!conversation) throw notFound("المحادثة");

  const messages = db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, id))
    .orderBy(asc(aiMessages.createdAt))
    .all();
  const proposals = messages.length
    ? db.select().from(aiProposals).where(inArray(aiProposals.messageId, messages.map((m) => m.id))).all()
    : [];
  const byMessage = new Map(proposals.map((p) => [p.messageId, p]));

  return {
    ...conversation,
    messages: messages.map((m) => {
      const p = byMessage.get(m.id);
      const operations = p ? proposalOperationSchema.array().safeParse(p.operations) : null;
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        proposal:
          p && operations?.success
            ? { id: p.id, summary: p.summary, operations: operations.data, status: p.status, error: p.error, decidedAt: p.decidedAt }
            : null,
      };
    }),
  };
}

export function requestsToday(db: AppDatabase): number {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = db
    .select({ n: count() })
    .from(aiMessages)
    .where(and(eq(aiMessages.role, "assistant"), gte(aiMessages.createdAt, since)))
    .get();
  return row?.n ?? 0;
}

/** يرسل سؤالاً، ويحفظ السؤال والرد (والاقتراح إن وُجد) */
export async function sendMessage({ db, provider, dailyLimit }: AssistantDeps, conversationId: string, content: string) {
  const conversation = db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), isNull(aiConversations.archivedAt)))
    .get();
  if (!conversation) throw notFound("المحادثة");

  if (requestsToday(db) >= dailyLimit) {
    throw new AppError(429, "AI_DAILY_LIMIT", `وصلت للحد اليومي (${dailyLimit} طلباً). يمكنك تغييره عبر AI_DAILY_LIMIT في ملف .env.`);
  }

  const history = db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt))
    .all();

  // نحفظ سؤال المستخدم أولاً: لو فشل المزوّد لا يضيع ما كتبه
  const userCreatedAt = now();
  db.insert(aiMessages).values({ id: randomUUID(), conversationId, role: "user", content, createdAt: userCreatedAt }).run();
  db.update(aiConversations)
    .set({ updatedAt: userCreatedAt, ...(history.length === 0 ? { title: titleFrom(content) } : {}) })
    .where(eq(aiConversations.id, conversationId))
    .run();

  // المسار المرتبط قد يُؤرشف لاحقاً؛ حينها نكمل بلا تفاصيله
  let context: string;
  try {
    context = buildContext(db, conversation.pathId);
  } catch {
    context = buildContext(db, null);
  }

  const result = await provider.complete({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(context, history, content),
    jsonSchema: REPLY_JSON_SCHEMA,
  });
  const reply = interpretReply(result.structured, result.text);

  return db.transaction((tx) => {
    const message = tx
      .insert(aiMessages)
      .values({
        id: randomUUID(),
        conversationId,
        role: "assistant",
        content: reply.reply,
        provider: provider.name,
        model: result.model ?? provider.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        // بعد سؤال المستخدم دائماً حتى لو تساوت الأوقات بالمللي ثانية
        createdAt: new Date(Math.max(Date.now(), Date.parse(userCreatedAt) + 1)).toISOString(),
      })
      .returning()
      .get();
    if (reply.proposal) {
      tx.insert(aiProposals)
        .values({ id: randomUUID(), messageId: message.id, summary: reply.proposal.summary, operations: reply.proposal.operations })
        .run();
    }
    tx.update(aiConversations).set({ updatedAt: now() }).where(eq(aiConversations.id, conversationId)).run();
    return message;
  });
}
