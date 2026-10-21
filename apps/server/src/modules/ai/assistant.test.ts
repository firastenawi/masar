import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeLogListSchema, conversationDetailSchema, pathDetailSchema } from "@masar/shared";
import { buildApp } from "../../app";
import { openDatabase, type AppDatabase } from "../../db/client";
import { interpretReply } from "./assistant.service";
import { cleanEnv, parseClaudeOutput } from "./claude-code.provider";
import { FakeProvider } from "./fake.provider";
import { REPLY_JSON_SCHEMA } from "./prompt";
import { AiProviderError } from "./provider";

let db: AppDatabase;
let provider: FakeProvider;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  db = openDatabase(":memory:");
  provider = new FakeProvider();
  app = buildApp({ db, ai: { provider, dailyLimit: 3 } });
});

afterEach(async () => {
  await app.close();
  db.$client.close();
});

async function call(method: "GET" | "POST" | "DELETE", url: string, payload?: unknown) {
  const res = await app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });
  return { status: res.statusCode, body: res.body ? (res.json() as unknown) : null };
}

async function createId(url: string, payload: unknown): Promise<string> {
  const res = await call("POST", url, payload);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { id: string }).id;
}

async function seed() {
  const pathId = await createId("/api/paths", { title: "DevOps", goal: "نشر بثقة" });
  const stageId = await createId(`/api/paths/${pathId}/stages`, { title: "Linux" });
  const taskId = await createId(`/api/stages/${stageId}/tasks`, { title: "الصلاحيات" });
  const conversationId = await createId("/api/ai/conversations", { pathId });
  return { pathId, stageId, taskId, conversationId };
}

const conversation = async (id: string) =>
  conversationDetailSchema.parse((await call("GET", `/api/ai/conversations/${id}`)).body);

describe("المحادثة", () => {
  it("ترسل السياق والسؤال وتحفظ الرد وعنوان المحادثة", async () => {
    const s = await seed();
    provider.enqueue({ reply: "ابدأ بـ chmod", proposal: null });
    await createId(`/api/ai/conversations/${s.conversationId}/messages`, { content: "كيف أتعلم الصلاحيات؟" });

    const request = provider.requests[0]!;
    expect(request.jsonSchema).toBeDefined();
    expect(request.prompt).toContain(`[task:${s.taskId}] الصلاحيات`);
    expect(request.prompt).toContain("<question>\nكيف أتعلم الصلاحيات؟");
    expect(request.system).not.toContain("DevOps"); // بيانات المستخدم ليست في التعليمات الثابتة

    const c = await conversation(s.conversationId);
    expect(c.title).toBe("كيف أتعلم الصلاحيات؟");
    expect(c.pathTitle).toBe("DevOps");
    expect(c.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "كيف أتعلم الصلاحيات؟"],
      ["assistant", "ابدأ بـ chmod"],
    ]);
  });

  it("يرسل الرسائل السابقة مع السؤال التالي", async () => {
    const s = await seed();
    await createId(`/api/ai/conversations/${s.conversationId}/messages`, { content: "سؤال أول" });
    await createId(`/api/ai/conversations/${s.conversationId}/messages`, { content: "سؤال ثانٍ" });
    expect(provider.requests[1]!.prompt).toContain("المستخدم: سؤال أول");
  });

  it("يحفظ سؤال المستخدم حتى لو فشل المزوّد، ويعرض رسالة الخطأ", async () => {
    const s = await seed();
    provider.enqueue(new AiProviderError("AI_NOT_LOGGED_IN", "Claude Code غير مسجّل الدخول", 503));
    const res = await call("POST", `/api/ai/conversations/${s.conversationId}/messages`, { content: "مرحبا" });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ code: "AI_NOT_LOGGED_IN", message: "Claude Code غير مسجّل الدخول" });
    expect((await conversation(s.conversationId)).messages).toHaveLength(1);
  });

  it("يطبّق الحد اليومي", async () => {
    const s = await seed();
    for (let i = 0; i < 3; i++) await createId(`/api/ai/conversations/${s.conversationId}/messages`, { content: `س${i}` });
    const res = await call("POST", `/api/ai/conversations/${s.conversationId}/messages`, { content: "زيادة" });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: "AI_DAILY_LIMIT" });
  });

  it("الأرشفة تخفي المحادثة", async () => {
    const s = await seed();
    await call("DELETE", `/api/ai/conversations/${s.conversationId}`);
    expect((await call("GET", "/api/ai/conversations")).body).toEqual([]);
  });
});

describe("اقتراحات التعديل", () => {
  async function propose(s: Awaited<ReturnType<typeof seed>>, operations: unknown[]) {
    provider.enqueue({ reply: "هذه خطة", proposal: { summary: "خطة الأسبوع", operations } });
    await createId(`/api/ai/conversations/${s.conversationId}/messages`, { content: "خطط لي" });
    const message = (await conversation(s.conversationId)).messages.at(-1)!;
    expect(message.proposal).not.toBeNull();
    return message.proposal!;
  }

  it("لا يتغيّر شيء قبل الموافقة، وعند الموافقة تُطبّق كل العمليات بمصدر ai", async () => {
    const s = await seed();
    const proposal = await propose(s, [
      { op: "create_stage", ref: "s1", pathId: s.pathId, title: "Docker" },
      { op: "create_task", stageRef: "s1", title: "أول حاوية", estimateMinutes: 60, type: "practice" },
      { op: "create_task", stageId: s.stageId, title: "chown", dueDate: "2999-01-01" },
      { op: "postpone_task", taskId: s.taskId, until: "2999-02-01", reason: null },
      { op: "update_path", pathId: s.pathId, targetDate: "2999-12-31", goal: null },
    ]);
    expect(proposal.status).toBe("pending");
    expect(pathDetailSchema.parse((await call("GET", `/api/paths/${s.pathId}`)).body).stages).toHaveLength(1);

    expect((await call("POST", `/api/ai/proposals/${proposal.id}/apply`)).status).toBe(204);

    const path = pathDetailSchema.parse((await call("GET", `/api/paths/${s.pathId}`)).body);
    expect(path.targetDate).toBe("2999-12-31");
    expect(path.goal).toBe("نشر بثقة"); // null من المساعد = لا تغيير
    expect(path.stages.map((st) => st.title)).toEqual(["Linux", "Docker"]);
    expect(path.stages[1]!.tasks[0]).toMatchObject({ title: "أول حاوية", estimateMinutes: 60, type: "practice" });
    expect(path.stages[0]!.tasks.map((t) => [t.title, t.status])).toEqual([
      ["الصلاحيات", "postponed"],
      ["chown", "not_started"],
    ]);

    const history = changeLogListSchema.parse((await call("GET", `/api/paths/${s.pathId}/history`)).body);
    const fromAi = history.filter((h) => h.source === "ai");
    expect(fromAi).toHaveLength(5);
    expect(fromAi.every((h) => h.reason === "خطة الأسبوع")).toBe(true);

    expect((await conversation(s.conversationId)).messages.at(-1)!.proposal!.status).toBe("applied");
    expect((await call("POST", `/api/ai/proposals/${proposal.id}/apply`)).status).toBe(400);
  });

  it("فشل عملية واحدة يلغي الاقتراح كله", async () => {
    const s = await seed();
    const proposal = await propose(s, [
      { op: "create_task", stageId: s.stageId, title: "تُضاف ثم تُلغى" },
      { op: "update_task", taskId: "غير-موجود", status: "done" },
    ]);
    const res = await call("POST", `/api/ai/proposals/${proposal.id}/apply`);
    expect(res.status).toBe(404);

    const path = pathDetailSchema.parse((await call("GET", `/api/paths/${s.pathId}`)).body);
    expect(path.stages[0]!.tasks).toHaveLength(1);
    const saved = (await conversation(s.conversationId)).messages.at(-1)!.proposal!;
    expect(saved).toMatchObject({ status: "failed", error: "المهمة غير موجود" });
  });

  it("الرفض لا يغيّر شيئاً", async () => {
    const s = await seed();
    const proposal = await propose(s, [{ op: "create_task", stageId: s.stageId, title: "x" }]);
    expect((await call("POST", `/api/ai/proposals/${proposal.id}/reject`)).status).toBe(204);
    const path = pathDetailSchema.parse((await call("GET", `/api/paths/${s.pathId}`)).body);
    expect(path.stages[0]!.tasks).toHaveLength(1);
  });

  it("اقتراح بعمليات غير صالحة يُسقَط ويبقى الرد", async () => {
    const s = await seed();
    provider.enqueue({ reply: "رد", proposal: { summary: "x", operations: [{ op: "delete_everything" }] } });
    await createId(`/api/ai/conversations/${s.conversationId}/messages`, { content: "؟" });
    const last = (await conversation(s.conversationId)).messages.at(-1)!;
    expect(last).toMatchObject({ content: "رد", proposal: null });
  });
});

describe("Claude Code provider", () => {
  it("يفسّر الرد الناجح مع المخرجات المنظّمة", () => {
    const stdout = JSON.stringify({
      type: "result",
      is_error: false,
      result: '{"reply":"مرحبا"}',
      structured_output: { reply: "مرحبا", proposal: null },
      total_cost_usd: 0.01,
      duration_ms: 1200,
      usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 },
      modelUsage: { "claude-sonnet-5-5": {} },
    });
    expect(parseClaudeOutput(stdout, 0)).toMatchObject({
      structured: { reply: "مرحبا", proposal: null },
      model: "claude-sonnet-5-5",
      inputTokens: 100,
      outputTokens: 5,
      durationMs: 1200,
    });
  });

  it("يحوّل خطأ عدم تسجيل الدخول إلى رسالة واضحة", () => {
    const stdout = JSON.stringify({ type: "result", is_error: true, result: "Not logged in · Please run /login" });
    expect(() => parseClaudeOutput(stdout, 0)).toThrow(/غير مسجّل الدخول/);
  });

  it("يحذف متغيرات Claude/Anthropic الموروثة ويبقي غيرها", () => {
    const env = cleanEnv({
      PATH: "x",
      ANTHROPIC_API_KEY: "secret",
      CLAUDECODE: "1",
      CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH: "1",
      CLAUDE_CODE_OAUTH_TOKEN: "keep",
    });
    expect(env).toEqual({ PATH: "x", CLAUDE_CODE_OAUTH_TOKEN: "keep" });
  });

  it("JSON Schema للرد صالح ويحتوي الحقول المطلوبة", () => {
    expect(REPLY_JSON_SCHEMA).toMatchObject({ type: "object", required: ["reply"] });
  });
});

describe("interpretReply", () => {
  it("يقبل JSON داخل كتلة كود، أو نصاً عادياً", () => {
    expect(interpretReply(null, '```json\n{"reply":"أهلاً","proposal":null}\n```')).toEqual({ reply: "أهلاً", proposal: null });
    expect(interpretReply(null, "رد عادي بلا JSON")).toEqual({ reply: "رد عادي بلا JSON", proposal: null });
  });
});
