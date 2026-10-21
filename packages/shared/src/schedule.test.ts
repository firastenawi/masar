import { describe, expect, it } from "vitest";
import { isQuietTime, localParts, nextOccurrence, quietEndAfter, zonedTimeToUtc } from "./schedule";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

describe("zonedTimeToUtc", () => {
  it("يحوّل وقتاً محلياً إلى UTC", () => {
    // دمشق UTC+3 طوال العام
    expect(zonedTimeToUtc(2026, 10, 22, 20, 0, "Asia/Damascus").toISOString()).toBe("2026-10-22T17:00:00.000Z");
    expect(zonedTimeToUtc(2026, 1, 1, 0, 30, "UTC").toISOString()).toBe("2026-01-01T00:30:00.000Z");
  });

  it("يحترم التوقيت الصيفي (برلين)", () => {
    expect(zonedTimeToUtc(2026, 1, 15, 9, 0, "Europe/Berlin").toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(zonedTimeToUtc(2026, 7, 15, 9, 0, "Europe/Berlin").toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });
});

describe("nextOccurrence", () => {
  it("اليوم نفسه إن لم يمرّ الوقت، وإلا الغد", () => {
    const morning = new Date("2026-10-22T05:00:00Z"); // 08:00 بدمشق
    expect(nextOccurrence(morning, "20:00", EVERY_DAY, "Asia/Damascus")?.toISOString()).toBe("2026-10-22T17:00:00.000Z");
    const night = new Date("2026-10-22T18:00:00Z"); // 21:00 بدمشق
    expect(nextOccurrence(night, "20:00", EVERY_DAY, "Asia/Damascus")?.toISOString()).toBe("2026-10-23T17:00:00.000Z");
  });

  it("الموعد نفسه تماماً لا يُحتسب (حصري)", () => {
    const exactly = new Date("2026-10-22T17:00:00Z");
    expect(nextOccurrence(exactly, "20:00", EVERY_DAY, "Asia/Damascus")?.toISOString()).toBe("2026-10-23T17:00:00.000Z");
  });

  it("يتخطى الأيام غير المختارة", () => {
    // 2026-10-22 خميس (4)؛ الجمعة فقط = 5
    const thursday = new Date("2026-10-22T05:00:00Z");
    const next = nextOccurrence(thursday, "18:00", [5], "Asia/Damascus")!;
    expect(next.toISOString()).toBe("2026-10-23T15:00:00.000Z");
    expect(localParts(next, "Asia/Damascus").weekday).toBe(5);
  });

  it("يعيد null لقائمة أيام فارغة", () => {
    expect(nextOccurrence(new Date(), "10:00", [], "UTC")).toBeNull();
  });
});

describe("ساعات الهدوء", () => {
  const tz = "Asia/Damascus";
  it("فترة عابرة لمنتصف الليل", () => {
    expect(isQuietTime(new Date("2026-10-22T21:00:00Z"), "23:00", "07:00", tz)).toBe(true); // 00:00
    expect(isQuietTime(new Date("2026-10-22T03:30:00Z"), "23:00", "07:00", tz)).toBe(true); // 06:30
    expect(isQuietTime(new Date("2026-10-22T04:00:00Z"), "23:00", "07:00", tz)).toBe(false); // 07:00
    expect(isQuietTime(new Date("2026-10-22T17:00:00Z"), "23:00", "07:00", tz)).toBe(false); // 20:00
  });

  it("فترة داخل اليوم، وفترة فارغة", () => {
    expect(isQuietTime(new Date("2026-10-22T11:00:00Z"), "13:00", "15:00", tz)).toBe(true); // 14:00
    expect(isQuietTime(new Date("2026-10-22T11:00:00Z"), "08:00", "08:00", tz)).toBe(false);
  });

  it("نهاية الهدوء التالية", () => {
    expect(quietEndAfter(new Date("2026-10-22T21:00:00Z"), "07:00", tz).toISOString()).toBe("2026-10-23T04:00:00.000Z");
  });
});
