import { describe, expect, it } from "vitest";
import { computeProgress } from "./progress";
import { isOverdue, todayIn } from "./dates";
import { pathCreateSchema, pathUpdateSchema, taskCreateSchema } from "./schemas/roadmap";

describe("computeProgress", () => {
  it("يرجع صفراً لقائمة فارغة", () => {
    expect(computeProgress([])).toMatchObject({ taskCount: 0, doneCount: 0, percent: 0 });
  });

  it("يحسب النسبة بحسب الأوزان", () => {
    const result = computeProgress([
      { status: "done", weight: 3 },
      { status: "not_started", weight: 1 },
    ]);
    expect(result.percent).toBe(75);
    expect(result.doneCount).toBe(1);
  });

  it("المهام المؤجلة تبقى في المقام", () => {
    const result = computeProgress([
      { status: "done", weight: 1 },
      { status: "postponed", weight: 1 },
    ]);
    expect(result.percent).toBe(50);
    expect(result.byStatus.postponed).toBe(1);
  });

  it("يقرّب للأسفل فلا تظهر 100% قبل الاكتمال", () => {
    const items = Array.from({ length: 200 }, (_, i) => ({
      status: i === 0 ? ("not_started" as const) : ("done" as const),
      weight: 1,
    }));
    expect(computeProgress(items).percent).toBe(99);
  });
});

describe("isOverdue", () => {
  it("المهمة غير المكتملة بعد موعدها متأخرة", () => {
    expect(isOverdue({ dueDate: "2026-01-01", status: "in_progress" }, "2026-01-02")).toBe(true);
  });
  it("المهمة المكتملة أو بلا موعد أو موعدها اليوم ليست متأخرة", () => {
    expect(isOverdue({ dueDate: "2026-01-01", status: "done" }, "2026-01-05")).toBe(false);
    expect(isOverdue({ dueDate: null, status: "not_started" }, "2026-01-05")).toBe(false);
    expect(isOverdue({ dueDate: "2026-01-05", status: "not_started" }, "2026-01-05")).toBe(false);
  });
});

describe("todayIn", () => {
  it("يحترم المنطقة الزمنية", () => {
    const instant = new Date("2026-03-01T22:30:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-03-01");
    expect(todayIn("Asia/Damascus", instant)).toBe("2026-03-02");
  });
});

describe("schemas", () => {
  it("المسار الجديد يأخذ قيماً افتراضية ويحوّل النص الفارغ إلى null", () => {
    const parsed = pathCreateSchema.parse({ title: " DevOps ", goal: "" });
    expect(parsed).toMatchObject({ title: "DevOps", goal: null, currentLevel: 1, status: "active" });
  });

  it("يرفض موعداً مستهدفاً قبل تاريخ البداية", () => {
    const result = pathCreateSchema.safeParse({
      title: "x",
      startDate: "2026-05-01",
      targetDate: "2026-04-01",
    });
    expect(result.success).toBe(false);
  });

  it("التعديل الجزئي لا يضيف قيماً افتراضية", () => {
    expect(pathUpdateSchema.parse({ title: "جديد" })).toEqual({ title: "جديد" });
  });

  it("المهمة ترفض وزناً خارج النطاق", () => {
    expect(taskCreateSchema.safeParse({ title: "x", weight: 11 }).success).toBe(false);
  });
});
