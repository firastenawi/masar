import { eq } from "drizzle-orm";
import { todayIn } from "@masar/shared";
import type { AppDatabase } from "../../db/client";
import { settings } from "../../db/schema";

/** المنطقة الزمنية المحفوظة في الإعدادات، وإلا منطقة النظام الذي يعمل عليه الخادم */
export function getTimeZone(db: AppDatabase): string {
  const row = db.select().from(settings).where(eq(settings.key, "timezone")).get();
  if (typeof row?.value === "string") return row.value;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function today(db: AppDatabase): string {
  return todayIn(getTimeZone(db));
}
