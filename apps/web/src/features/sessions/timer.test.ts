import { describe, expect, it } from "vitest";
import { elapsedMinutes, formatClock } from "./timer";

describe("timer helpers", () => {
  it("المدة دقيقة واحدة على الأقل وتُقرّب", () => {
    const start = "2026-10-21T10:00:00.000Z";
    expect(elapsedMinutes(start, Date.parse("2026-10-21T10:00:10Z"))).toBe(1);
    expect(elapsedMinutes(start, Date.parse("2026-10-21T10:44:40Z"))).toBe(45);
  });

  it("يعرض الوقت بصيغة ساعة:دقيقة:ثانية", () => {
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });
});
