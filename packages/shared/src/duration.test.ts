import { describe, expect, it } from "vitest";
import { formatMinutes } from "./duration";

describe("formatMinutes", () => {
  it("يعرض الدقائق فقط إذا كانت أقل من ساعة", () => {
    expect(formatMinutes(0)).toBe("0 د");
    expect(formatMinutes(45)).toBe("45 د");
  });

  it("يعرض الساعات فقط عند عدم وجود دقائق متبقية", () => {
    expect(formatMinutes(120)).toBe("2 س");
  });

  it("يعرض الساعات والدقائق معاً", () => {
    expect(formatMinutes(90)).toBe("1 س 30 د");
  });

  it("يقرّب الكسور إلى أقرب دقيقة", () => {
    expect(formatMinutes(59.6)).toBe("1 س");
  });

  it("يرفض القيم السالبة وغير الرقمية", () => {
    expect(() => formatMinutes(-1)).toThrow(RangeError);
    expect(() => formatMinutes(Number.NaN)).toThrow(RangeError);
  });
});
