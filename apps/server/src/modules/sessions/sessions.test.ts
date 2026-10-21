import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addDays,
  changeLogListSchema,
  dashboardResponseSchema,
  pathDetailSchema,
  sessionListSchema,
  todayIn,
  todayResponseSchema,
} from "@masar/shared";
import { buildApp } from "../../app";
import { openDatabase, type AppDatabase } from "../../db/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

let db: AppDatabase;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  db = openDatabase(":memory:");
  app = buildApp({ db });
});

afterEach(async () => {
  await app.close();
  db.$client.close();
});

async function call(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) {
  const res = await app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });
  return { status: res.statusCode, body: res.body ? (res.json() as unknown) : null };
}

async function createId(url: string, payload: unknown): Promise<string> {
  const res = await call("POST", url, payload);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { id: string }).id;
}

async function seed() {
  const pathId = await createId("/api/paths", { title: "DevOps" });
  const stageId = await createId(`/api/paths/${pathId}/stages`, { title: "Linux" });
  const taskA = await createId(`/api/stages/${stageId}/tasks`, { title: "أوامر أساسية" });
  const taskB = await createId(`/api/stages/${stageId}/tasks`, { title: "الصلاحيات" });
  return { pathId, stageId, taskA, taskB };
}

const sessions = async (query = "") => sessionListSchema.parse((await call("GET", `/api/sessions${query}`)).body);

describe("جلسات التعلم", () => {
  it("جلسة على مهمة: تستنتج المسار، وتنقل المهمة إلى قيد التنفيذ، وتُحسب كوقت فعلي", async () => {
    const s = await seed();
    await createId("/api/sessions", { taskId: s.taskA, startedAt: daysAgo(0), durationMinutes: 45, topics: "ls و grep" });

    const [session] = await sessions();
    expect(session).toMatchObject({ pathId: s.pathId, pathTitle: "DevOps", taskTitle: "أوامر أساسية", localDate: today });

    const detail = pathDetailSchema.parse((await call("GET", `/api/paths/${s.pathId}`)).body);
    expect(detail.stages[0]!.tasks[0]).toMatchObject({ status: "in_progress", actualMinutes: 45 });

    const history = changeLogListSchema.parse((await call("GET", `/api/paths/${s.pathId}/history`)).body);
    expect(history[0]).toMatchObject({ action: "update", after: { status: "in_progress" } });
  });

  it("completeTask يكمل المهمة مع حفظ الجلسة", async () => {
    const s = await seed();
    await createId("/api/sessions", { taskId: s.taskA, startedAt: daysAgo(0), durationMinutes: 30, completeTask: true });
    const detail = pathDetailSchema.parse((await call("GET", `/api/paths/${s.pathId}`)).body);
    expect(detail.stages[0]!.tasks[0]!.status).toBe("done");
    expect(detail.progress.percent).toBe(50);
  });

  it("جلسة حرة بلا مسار مقبولة", async () => {
    await createId("/api/sessions", { startedAt: daysAgo(0), durationMinutes: 20, notes: "قراءة مقال" });
    expect(await sessions()).toHaveLength(1);
  });

  it("يرفض مهمة لا تتبع المسار المختار، وجلسة في المستقبل، ومدة غير صالحة", async () => {
    const s = await seed();
    const other = await createId("/api/paths", { title: "آخر" });
    const mismatch = await call("POST", "/api/sessions", { pathId: other, taskId: s.taskA, startedAt: daysAgo(0), durationMinutes: 10 });
    expect(mismatch.body).toMatchObject({ code: "TASK_PATH_MISMATCH" });

    const future = await call("POST", "/api/sessions", { startedAt: new Date(Date.now() + DAY_MS).toISOString(), durationMinutes: 10 });
    expect(future.body).toMatchObject({ code: "FUTURE_SESSION" });

    const zero = await call("POST", "/api/sessions", { startedAt: daysAgo(0), durationMinutes: 0 });
    expect(zero.status).toBe(400);
  });

  it("الفلترة بالمسار وبالمراجعة لاحقاً", async () => {
    const s = await seed();
    await createId("/api/sessions", { pathId: s.pathId, startedAt: daysAgo(1), durationMinutes: 10, reviewLater: "chmod" });
    await createId("/api/sessions", { startedAt: daysAgo(0), durationMinutes: 10, reviewLater: "" });

    expect(await sessions(`?pathId=${s.pathId}`)).toHaveLength(1);
    const review = await sessions("?reviewOnly=true");
    expect(review).toHaveLength(1);
    expect(review[0]!.reviewLater).toBe("chmod");
  });

  it("التعديل يعيد حساب اليوم، والأرشفة تخفي الجلسة", async () => {
    const id = await createId("/api/sessions", { startedAt: daysAgo(0), durationMinutes: 10 });
    await call("PATCH", `/api/sessions/${id}`, { startedAt: daysAgo(3), topics: "تعديل" });
    expect((await sessions())[0]).toMatchObject({ localDate: addDays(today, -3), topics: "تعديل" });

    expect((await call("DELETE", `/api/sessions/${id}`)).status).toBe(204);
    expect(await sessions()).toHaveLength(0);
    expect((await call("DELETE", `/api/sessions/${id}`)).status).toBe(404);
  });
});

describe("صفحة اليوم", () => {
  it("تصنّف المهام وتقترح الخطوة التالية", async () => {
    const pathId = await createId("/api/paths", { title: "DevOps" });
    const stageId = await createId(`/api/paths/${pathId}/stages`, { title: "Linux" });
    const late = await createId(`/api/stages/${stageId}/tasks`, { title: "متأخرة", dueDate: addDays(today, -2) });
    const due = await createId(`/api/stages/${stageId}/tasks`, { title: "اليوم", dueDate: today });
    const soon = await createId(`/api/stages/${stageId}/tasks`, { title: "قريباً", dueDate: addDays(today, 3) });
    await createId(`/api/stages/${stageId}/tasks`, { title: "بعيدة", dueDate: addDays(today, 30) });

    const body = todayResponseSchema.parse((await call("GET", "/api/today")).body);
    expect(body.today).toBe(today);
    expect(body.overdue.map((t) => t.id)).toEqual([late]);
    expect(body.dueToday.map((t) => t.id)).toEqual([due]);
    expect(body.upcoming.map((t) => t.id)).toEqual([soon]);
    expect(body.suggestion).toMatchObject({ reason: "overdue", task: { id: late, pathTitle: "DevOps", stageTitle: "Linux" } });
  });

  it("المسارات المتوقفة مؤقتاً لا تظهر في اليوم", async () => {
    const pathId = await createId("/api/paths", { title: "متوقف", status: "paused" });
    const stageId = await createId(`/api/paths/${pathId}/stages`, { title: "م" });
    await createId(`/api/stages/${stageId}/tasks`, { title: "x", dueDate: today });
    const body = todayResponseSchema.parse((await call("GET", "/api/today")).body);
    expect(body.dueToday).toHaveLength(0);
    expect(body.suggestion).toBeNull();
  });

  it("تحسب السلسلة ودقائق اليوم", async () => {
    for (const n of [0, 1, 2]) await createId("/api/sessions", { startedAt: daysAgo(n), durationMinutes: 20 });
    await createId("/api/sessions", { startedAt: daysAgo(0), durationMinutes: 15 });
    const body = todayResponseSchema.parse((await call("GET", "/api/today")).body);
    expect(body.streak).toEqual({ current: 3, longest: 3, activeToday: true });
    expect(body.minutesToday).toBe(35);
  });
});

describe("لوحة التحكم", () => {
  it("تجمع الإحصاءات الأساسية", async () => {
    const s = await seed();
    await createId("/api/sessions", { taskId: s.taskA, startedAt: daysAgo(0), durationMinutes: 40, completeTask: true });
    await createId("/api/sessions", { startedAt: daysAgo(10), durationMinutes: 60 });

    const body = dashboardResponseSchema.parse((await call("GET", "/api/dashboard")).body);
    expect(body).toMatchObject({ minutesToday: 40, minutesLast7Days: 40, tasksDoneLast7Days: 1, overdueCount: 0 });
    expect(body.weeklyMinutes).toHaveLength(8);
    expect(body.weeklyMinutes.at(-1)).toMatchObject({ end: today, minutes: 40 });
    expect(body.weeklyMinutes.at(-2)!.minutes).toBe(60);
    expect(body.suggestion?.task.id).toBe(s.taskB);
    expect(body.paths[0]!.progress.percent).toBe(50);
  });
});
