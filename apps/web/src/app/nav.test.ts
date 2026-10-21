import { describe, expect, it } from "vitest";
import ar from "../locales/ar.json";
import { navItems } from "./nav";

function lookup(obj: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
    obj,
  );
}

describe("navItems", () => {
  it("لكل عنصر ترجمة عربية", () => {
    for (const item of navItems) {
      expect(lookup(ar, item.labelKey), item.labelKey).toBeTypeOf("string");
    }
  });

  it("المسارات غير مكررة", () => {
    const paths = navItems.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("الشريط السفلي على الهاتف لا يتجاوز 5 عناصر", () => {
    expect(navItems.filter((item) => item.mobile).length).toBeLessThanOrEqual(5);
  });
});
