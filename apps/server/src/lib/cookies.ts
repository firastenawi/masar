/** قراءة وكتابة الكوكيز بلا مكتبة إضافية (نحتاج كوكي واحداً فقط) */

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  secure?: boolean;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly", // لا يستطيع JavaScript في الصفحة قراءته
    "SameSite=Lax", // لا يُرسل مع طلبات POST من مواقع أخرى (حماية من CSRF)
  ];
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${options.maxAgeSeconds}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
