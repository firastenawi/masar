import { describe, expect, it } from "vitest";
import { pathCreateSchema } from "@masar/shared";
import { fieldErrors, optionalInt } from "./forms";
import { formatDate } from "./format";

describe("fieldErrors", () => {
  it("يرجع رسالة واحدة لكل حقل", () => {
    const result = pathCreateSchema.safeParse({ title: "", startDate: "2026-02-01", targetDate: "2026-01-01" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toMatchObject({ title: "العنوان مطلوب" });
    }
  });
});

describe("optionalInt", () => {
  it("يحوّل النص الفارغ إلى null والرقم إلى عدد", () => {
    expect(optionalInt("  ")).toBeNull();
    expect(optionalInt("45")).toBe(45);
  });
});

describe("formatDate", () => {
  it("يعرض التاريخ بالعربية وبأرقام لاتينية", () => {
    expect(formatDate("2026-11-05")).toMatch(/5/);
    expect(formatDate(null)).toBe("—");
  });
});
