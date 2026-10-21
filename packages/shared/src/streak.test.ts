import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { computeStreak } from "./streak";
import { suggestNextTask, type SuggestionCandidate } from "./suggestion";

describe("addDays", () => {
  it("يعبر حدود الشهر والسنة", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("computeStreak", () => {
  const today = "2026-10-21";

  it("صفر بلا جلسات", () => {
    expect(computeStreak([], today)).toEqual({ current: 0, longest: 0, activeToday: false });
  });

  it("يعدّ الأيام المتتالية حتى اليوم", () => {
    expect(computeStreak(["2026-10-19", "2026-10-20", "2026-10-21"], today)).toEqual({
      current: 3,
      longest: 3,
      activeToday: true,
    });
  });

  it("السلسلة لا تنكسر إذا لم تُسجَّل جلسة اليوم بعد", () => {
    expect(computeStreak(["2026-10-19", "2026-10-20"], today)).toMatchObject({ current: 2, activeToday: false });
  });

  it("تنكسر إذا فات يوم كامل", () => {
    expect(computeStreak(["2026-10-18", "2026-10-19"], today).current).toBe(0);
  });

  it("يحسب أطول سلسلة في التاريخ ويتجاهل التكرار والمستقبل", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-10-21", "2026-10-21", "2026-10-25"];
    expect(computeStreak(days, today)).toEqual({ current: 1, longest: 4, activeToday: true });
  });
});

describe("suggestNextTask", () => {
  const today = "2026-10-21";
  let n = 0;
  const task = (over: Partial<SuggestionCandidate>): SuggestionCandidate => ({
    id: `t${++n}`,
    stageId: "s",
    title: "مهمة",
    description: null,
    type: "lesson",
    status: "not_started",
    priority: "medium",
    difficulty: 2,
    weight: 1,
    estimateMinutes: null,
    actualMinutes: 0,
    dueDate: null,
    completedAt: null,
    notes: null,
    sortOrder: 0,
    isOverdue: false,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    pathId: "p",
    pathTitle: "مسار",
    stageTitle: "مرحلة",
    pathSortOrder: 0,
    stageSortOrder: 0,
    ...over,
  });

  it("لا اقتراح بلا مهام مفتوحة", () => {
    expect(suggestNextTask([task({ status: "done" })], today)).toBeNull();
  });

  it("يقدّم ما هو قيد التنفيذ على المتأخر", () => {
    const result = suggestNextTask(
      [task({ id: "late", dueDate: "2026-10-01" }), task({ id: "wip", status: "in_progress" })],
      today,
    );
    expect(result).toMatchObject({ reason: "in_progress", task: { id: "wip" } });
  });

  it("المتأخر الأقدم أولاً، ثم المستحق اليوم", () => {
    const tasks = [
      task({ id: "today", dueDate: today }),
      task({ id: "late2", dueDate: "2026-10-10" }),
      task({ id: "late1", dueDate: "2026-10-05" }),
    ];
    expect(suggestNextTask(tasks, today)).toMatchObject({ reason: "overdue", task: { id: "late1" } });
    expect(suggestNextTask(tasks.slice(0, 1), today)).toMatchObject({ reason: "due_today" });
  });

  it("يتجاهل المؤجل إلى موعد لم يحن", () => {
    const result = suggestNextTask(
      [task({ id: "later", status: "postponed", dueDate: "2026-11-01", priority: "high" }), task({ id: "next" })],
      today,
    );
    expect(result).toMatchObject({ reason: "next_in_path", task: { id: "next" } });
  });

  it("يختار أول مهمة بترتيب الخطة", () => {
    const result = suggestNextTask(
      [task({ id: "b", stageSortOrder: 1 }), task({ id: "a", stageSortOrder: 0, sortOrder: 3 })],
      today,
    );
    expect(result?.task.id).toBe("a");
    expect(result?.task).not.toHaveProperty("pathSortOrder");
  });
});
