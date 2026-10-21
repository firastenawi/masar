import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * يخدم الواجهة المبنية (apps/web/dist) من نفس الخادم، بلا مكتبة إضافية:
 * - الملفات ذات البصمة في /assets تُخزَّن سنة كاملة.
 * - index.html و sw.js لا تُخزَّن، حتى يصل التحديث فوراً.
 * - أي مسار آخر غير /api يرجع index.html (توجيه الواجهة يتولاه React Router).
 */
export function createStaticHandler(distDir: string) {
  const root = path.resolve(distDir);
  const indexFile = path.join(root, "index.html");

  return function serve(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.method !== "GET" && request.method !== "HEAD") return false;
    const urlPath = decodeURIComponent((request.url.split("?")[0] ?? "/").replace(/\+/g, " "));
    if (urlPath.startsWith("/api/")) return false;

    // منع الخروج من مجلد الواجهة (../)
    const candidate = path.resolve(root, `.${urlPath}`);
    const insideRoot = candidate === root || candidate.startsWith(root + path.sep);
    const isFile = insideRoot && existsSync(candidate) && statSync(candidate).isFile();
    const file = isFile ? candidate : indexFile;
    if (!existsSync(file)) return false;

    const ext = path.extname(file).toLowerCase();
    const immutable = isFile && urlPath.startsWith("/assets/");
    reply
      .header("content-type", MIME[ext] ?? "application/octet-stream")
      .header("cache-control", immutable ? "public, max-age=31536000, immutable" : "no-cache")
      .header("x-content-type-options", "nosniff");
    if (ext === ".html") reply.header("x-frame-options", "DENY").header("referrer-policy", "same-origin");
    reply.send(createReadStream(file));
    return true;
  };
}
