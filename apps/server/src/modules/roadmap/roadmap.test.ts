import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeLogListSchema, pathDetailSchema, pathListSchema, type PathDetail } from "@masar/shared";
import { buildApp } from "../../app";
import { openDatabase, type AppDatabase } from "../../db/client";

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

async function call(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: unknown) {
  const res = await app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });
  return { status: res.statusCode, body: res.body ? (res.json() as unknown) : null };
}

async function createId(url: string, payload: unknown): Promise<string> {
  const res = await call("POST", url, payload);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { id: string }).id;
}

async function detail(pathId: string): Promise<PathDetail> {
  const res = await call("GET", `/api/paths/${pathId}`);
  expect(res.status).toBe(200);
  return pathDetailSchema.parse(res.body);
}

/** مسار فيه مرحلتان: الأولى بثلاث مهام والثانية بمهمة واحدة */
async function seed() {
  const pathId = await createId("/api/paths", { title: "DevOps", goal: "نشر تطبيقات بثقة" });
  const stage1 = await createId(`/api/paths/${pathId}/stages`, { title: "Linux" });
  const stage2 = await createId(`/api/paths/${pathId}/stages`, { title: "Docker" });
  const t1 = await createId(`/api/stages/${stage1}/tasks`, { title: "أوامر أساسية" });
  const t2 = await createId(`/api/stages/${stage1}/tasks`, { title: "الصلاحيات" });
  const t3 = await createId(`/api/stages/${stage1}/tasks`, { title: "مشروع: سكربت نسخ احتياطي", type: "project", weight: 3 });
  const t4 = await createId(`/api/stages/${stage2}/tasks`, { title: "أول حاوية" });
  return { pathId, stage1, stage2, t1, t2, t3, t4 };
}

describe("المسارات", () => {
  it("ينشئ مساراً بقيم افتراضية ويعرضه في القائمة", async () => {
    const id = await createId("/api/paths", { title: "  الذكاء الاصطناعي  ", description: "" });
    const list = pathListSchema.parse((await call("GET", "/api/paths")).body);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id,
      title: "الذكاء الاصطناعي",
      description: null,
      currentLevel: 1,
      targetLevel: 3,
      status: "active",
    });
    expect(list[0]!.progress.percent).toBe(0);
  });

  it("يرفض بيانات غير صالحة برسالة موحّدة", async () => {
    const res = await call("POST", "/api/paths", { title: "", currentLevel: 9 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("يرفض تعديلاً يجعل الموعد المستهدف قبل تاريخ البداية المحفوظ", async () => {
    const id = await createId("/api/paths", { title: "x", startDate: "2026-06-01" });
    const res = await call("PATCH", `/api/paths/${id}`, { targetDate: "2026-05-01" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_DATES" });
  });

  it("الأرشفة تخفي المسار لكن سجله يبقى", async () => {
    const id = await createId("/api/paths", { title: "مؤقت" });
    expect((await call("DELETE", `/api/paths/${id}`)).status).toBe(204);
    expect(pathListSchema.parse((await call("GET", "/api/paths")).body)).toHaveLength(0);
    expect((await call("GET", `/api/paths/${id}`)).status).toBe(404);
    const history = changeLogListSchema.parse((await call("GET", `/api/paths/${id}/history`)).body);
    expect(history.map((h) => h.action)).toEqual(expect.arrayContaining(["create", "archive"]));
  });

  it("يرجع 404 لمسار غير موجود", async () => {
    const res = await call("GET", "/api/paths/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: "NOT_FOUND", message: "المسار غير موجود" });
  });
});

describe("التقدّم", () => {
  it("يُحسب بالأوزان على مستوى المرحلة والمسار", async () => {
    const s = await seed();
    await call("PATCH", `/api/tasks/${s.t3}`, { status: "done" }); // وزن 3 من أصل 5 في المرحلة الأولى

    const d = await detail(s.pathId);
    expect(d.stages[0]!.progress.percent).toBe(60);
    expect(d.stages[1]!.progress.percent).toBe(0);
    // المسار: 3 من أصل 6 (وليس متوسط 60% و0%)
    expect(d.progress.percent).toBe(50);
  });

  it("يسجّل وقت الإكمال ويمسحه عند التراجع", async () => {
    const s = await seed();
    await call("PATCH", `/api/tasks/${s.t1}`, { status: "done" });
    expect((await detail(s.pathId)).stages[0]!.tasks[0]!.completedAt).not.toBeNull();
    await call("PATCH", `/api/tasks/${s.t1}`, { status: "in_progress" });
    expect((await detail(s.pathId)).stages[0]!.tasks[0]!.completedAt).toBeNull();
  });

  it("المهام والمراحل المؤرشفة تخرج من الحساب", async () => {
    const s = await seed();
    await call("PATCH", `/api/tasks/${s.t4}`, { status: "done" });
    await call("DELETE", `/api/stages/${s.stage2}`);
    const d = await detail(s.pathId);
    expect(d.stages).toHaveLength(1);
    expect(d.progress).toMatchObject({ taskCount: 3, percent: 0 });
  });

  it("يحسب المهام المتأخرة وأقرب موعد", async () => {
    const s = await seed();
    await call("PATCH", `/api/tasks/${s.t1}`, { dueDate: "2000-01-01" });
    await call("PATCH", `/api/tasks/${s.t2}`, { dueDate: "2999-01-01" });
    const d = await detail(s.pathId);
    expect(d.overdueCount).toBe(1);
    expect(d.nextDueDate).toBe("2000-01-01");
    expect(d.stages[0]!.tasks[0]!.isOverdue).toBe(true);
  });
});

describe("الترتيب والنقل", () => {
  it("يعيد ترتيب المهام والمراحل", async () => {
    const s = await seed();
    expect((await call("PUT", `/api/stages/${s.stage1}/tasks/order`, { ids: [s.t3, s.t1, s.t2] })).status).toBe(204);
    expect((await call("PUT", `/api/paths/${s.pathId}/stages/order`, { ids: [s.stage2, s.stage1] })).status).toBe(204);
    const d = await detail(s.pathId);
    expect(d.stages.map((st) => st.id)).toEqual([s.stage2, s.stage1]);
    expect(d.stages[1]!.tasks.map((t) => t.id)).toEqual([s.t3, s.t1, s.t2]);
  });

  it("يرفض ترتيباً ناقصاً أو مكرراً", async () => {
    const s = await seed();
    const missing = await call("PUT", `/api/stages/${s.stage1}/tasks/order`, { ids: [s.t1, s.t2] });
    const dup = await call("PUT", `/api/stages/${s.stage1}/tasks/order`, { ids: [s.t1, s.t1, s.t2] });
    expect(missing.status).toBe(400);
    expect(dup.status).toBe(400);
  });

  it("ينقل مهمة إلى مرحلة أخرى في نفس المسار ويضعها في آخرها", async () => {
    const s = await seed();
    await call("PATCH", `/api/tasks/${s.t1}`, { stageId: s.stage2 });
    const d = await detail(s.pathId);
    expect(d.stages[1]!.tasks.map((t) => t.id)).toEqual([s.t4, s.t1]);
  });

  it("يرفض نقل مهمة إلى مسار آخر", async () => {
    const s = await seed();
    const otherPath = await createId("/api/paths", { title: "آخر" });
    const otherStage = await createId(`/api/paths/${otherPath}/stages`, { title: "مرحلة" });
    const res = await call("PATCH", `/api/tasks/${s.t1}`, { stageId: otherStage });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "CROSS_PATH_MOVE" });
  });
});

describe("التأجيل وسجل التغييرات", () => {
  it("يؤجل المهمة ويسجّل السبب والموعد القديم", async () => {
    const s = await seed();
    await call("PATCH", `/api/tasks/${s.t1}`, { dueDate: "2026-11-01" });
    const res = await call("POST", `/api/tasks/${s.t1}/postpone`, { until: "2026-11-15", reason: "ضغط عمل" });
    expect(res.status).toBe(200);

    const task = (await detail(s.pathId)).stages[0]!.tasks[0]!;
    expect(task).toMatchObject({ status: "postponed", dueDate: "2026-11-15" });

    const history = changeLogListSchema.parse((await call("GET", `/api/paths/${s.pathId}/history`)).body);
    const entry = history.find((h) => h.action === "postpone")!;
    expect(entry).toMatchObject({
      entityTitle: "أوامر أساسية",
      reason: "ضغط عمل",
      before: { status: "not_started", dueDate: "2026-11-01" },
      after: { status: "postponed", dueDate: "2026-11-15" },
      source: "user",
    });
  });

  it("لا يؤجل مهمة مكتملة", async () => {
    const s = await seed();
    await call("PATCH", `/api/tasks/${s.t1}`, { status: "done" });
    const res = await call("POST", `/api/tasks/${s.t1}/postpone`, { until: "2026-12-01" });
    expect(res.status).toBe(400);
  });

  it("يسجّل الحقول المتغيّرة فقط، ولا يسجّل تعديلاً بلا تغيير", async () => {
    const s = await seed();
    await call("PATCH", `/api/tasks/${s.t2}`, { title: "الصلاحيات", priority: "high" });
    await call("PATCH", `/api/tasks/${s.t2}`, { priority: "high" });

    const history = changeLogListSchema.parse((await call("GET", `/api/paths/${s.pathId}/history`)).body);
    const updates = history.filter((h) => h.action === "update" && h.entityId === s.t2);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ before: { priority: "medium" }, after: { priority: "high" } });
  });
});

describe("المهارات المستهدفة", () => {
  it("تُضاف وتُعدّل وتُؤرشف", async () => {
    const pathId = await createId("/api/paths", { title: "DevOps" });
    const skillId = await createId(`/api/paths/${pathId}/skills`, { name: "Kubernetes" });
    await call("PATCH", `/api/skills/${skillId}`, { targetLevel: 4 });
    expect((await detail(pathId)).skills).toEqual([
      expect.objectContaining({ id: skillId, name: "Kubernetes", targetLevel: 4 }),
    ]);
    await call("DELETE", `/api/skills/${skillId}`);
    expect((await detail(pathId)).skills).toHaveLength(0);
  });
});
