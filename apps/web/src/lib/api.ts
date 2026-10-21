import type { z } from "zod";
import { apiErrorSchema } from "@masar/shared";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export const UNAUTHENTICATED_EVENT = "masar:unauthenticated";

async function request(method: Method, path: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        Accept: "application/json",
        // لا نرسل Content-Type بلا جسم، فالخادم يرفض JSON فارغاً
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "تعذّر الاتصال بالخادم");
  }

  // انتهت الجلسة أو لم يُسجَّل الدخول: بوابة الدخول تستمع لهذا الحدث وتعرض شاشة الدخول
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));

  if (res.status === 204) return null;
  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    throw parsed.success
      ? new ApiRequestError(res.status, parsed.data.code, parsed.data.message)
      : new ApiRequestError(res.status, "UNKNOWN", "حدث خطأ غير متوقع");
  }
  return json;
}

/** طلب GET مع التحقق من شكل الرد عبر Zod */
export async function apiGet<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  return schema.parse(await request("GET", path));
}

/** طلب تعديل (POST/PATCH/PUT/DELETE)؛ يتحقق من الرد إذا مُرّر schema */
export async function apiSend<T extends z.ZodType>(
  method: Exclude<Method, "GET">,
  path: string,
  body?: unknown,
  schema?: T,
): Promise<z.infer<T> | null> {
  const json = await request(method, path, body);
  return schema ? schema.parse(json) : null;
}
