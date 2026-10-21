import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { AiProviderError, type AiProvider, type AiRequest, type AiResult } from "./provider";

export interface ClaudeCodeOptions {
  /** مسار claude.exe؛ يُكتشف تلقائياً على Windows إن لم يُحدَّد */
  bin?: string | undefined;
  model?: string | undefined;
  /** مجلد عمل محايد حتى لا يقرأ Claude Code ملفات أي مشروع */
  workDir: string;
  timeoutMs: number;
}

/** على Windows، الأمر "claude" هو claude.cmd يستدعي claude.exe؛ نستدعي الملف التنفيذي مباشرة */
export function resolveClaudeBin(explicit?: string): string {
  if (explicit) return explicit;
  if (process.platform === "win32" && process.env.APPDATA) {
    const exe = path.join(process.env.APPDATA, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
    if (existsSync(exe)) return exe;
  }
  return "claude";
}

/**
 * بيئة نظيفة لعملية Claude Code الفرعية:
 * - نحذف متغيرات CLAUDE_* و ANTHROPIC_* الموروثة (مثلاً حين يُشغَّل الخادم من داخل جلسة Claude)،
 *   حتى يستخدم Claude Code تسجيل دخولك أنت.
 * - ونحذف ANTHROPIC_API_KEY تحديداً حتى لا يُحاسَب الاستخدام على مفتاح API بدل اشتراكك.
 * الاستثناء: CLAUDE_CODE_OAUTH_TOKEN إن ضبطته بنفسك (من `claude setup-token`).
 */
export function cleanEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (/^(CLAUDE|ANTHROPIC)/i.test(key) && key !== "CLAUDE_CODE_OAUTH_TOKEN" && key !== "CLAUDE_CONFIG_DIR") continue;
    env[key] = value;
  }
  return env;
}

interface ClaudeJsonResult {
  type?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  modelUsage?: Record<string, unknown>;
  api_error_status?: number | null;
}

/** يحوّل ناتج `claude -p --output-format json` إلى نتيجة موحّدة، أو خطأ بالعربية */
export function parseClaudeOutput(stdout: string, durationMs: number): AiResult {
  let data: ClaudeJsonResult;
  try {
    // قد تسبق سطرَ JSON الأخير أسطرُ تحذير
    const line = stdout.trim().split(/\r?\n/).reverse().find((l) => l.trim().startsWith("{"));
    data = JSON.parse(line ?? "") as ClaudeJsonResult;
  } catch {
    throw new AiProviderError("AI_BAD_OUTPUT", "رد غير مفهوم من Claude Code");
  }

  const message = data.result ?? "";
  if (data.is_error) {
    if (/not logged in|\/login|authenticat|oauth/i.test(message)) {
      throw new AiProviderError(
        "AI_NOT_LOGGED_IN",
        "Claude Code غير مسجّل الدخول. افتح الطرفية واكتب: claude ثم /login وسجّل بحساب Claude الخاص بك.",
        503,
      );
    }
    if (/rate|limit|usage|quota/i.test(message) || data.api_error_status === 429) {
      throw new AiProviderError("AI_RATE_LIMIT", "وصلت لحد الاستخدام في اشتراكك مؤقتاً. حاول لاحقاً.", 429);
    }
    throw new AiProviderError("AI_ERROR", `خطأ من Claude Code: ${message || "غير معروف"}`);
  }

  const usage = data.usage ?? {};
  const inputTokens =
    (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  return {
    text: message,
    structured: data.structured_output ?? null,
    model: Object.keys(data.modelUsage ?? {})[0] ?? null,
    inputTokens: inputTokens || null,
    outputTokens: usage.output_tokens ?? null,
    costUsd: data.total_cost_usd ?? null,
    durationMs: data.duration_ms ?? durationMs,
  };
}

/**
 * يستدعي Claude Code في وضع غير تفاعلي (`claude -p`) باشتراكك.
 * بلا أدوات (لا قراءة ملفات ولا أوامر)، وبلا MCP، وبلا حفظ جلسة: المساعد يرى فقط ما نرسله.
 */
export class ClaudeCodeProvider implements AiProvider {
  readonly name = "claude-code";
  readonly model: string | null;
  private readonly bin: string;

  constructor(private readonly options: ClaudeCodeOptions) {
    this.bin = resolveClaudeBin(options.bin);
    this.model = options.model ?? null;
    mkdirSync(options.workDir, { recursive: true });
  }

  complete(request: AiRequest): Promise<AiResult> {
    const args = [
      "-p",
      "--output-format", "json",
      "--tools", "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--system-prompt", request.system,
    ];
    if (this.model) args.push("--model", this.model);
    if (request.jsonSchema) args.push("--json-schema", JSON.stringify(request.jsonSchema));

    const started = Date.now();
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, {
        cwd: this.options.workDir,
        env: cleanEnv(process.env),
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new AiProviderError("AI_TIMEOUT", "استغرق المساعد وقتاً أطول من المسموح. حاول بسؤال أقصر.", 504));
      }, this.options.timeoutMs);

      child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));

      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          error.code === "ENOENT"
            ? new AiProviderError("AI_NOT_INSTALLED", "لم يُعثر على Claude Code. ثبّته أو اضبط CLAUDE_BIN في ملف .env.", 503)
            : new AiProviderError("AI_SPAWN_FAILED", `تعذّر تشغيل Claude Code: ${error.message}`),
        );
      });

      child.on("close", () => {
        clearTimeout(timer);
        try {
          resolve(parseClaudeOutput(stdout, Date.now() - started));
        } catch (error) {
          if (error instanceof AiProviderError && error.code === "AI_BAD_OUTPUT" && stderr.trim()) {
            reject(new AiProviderError("AI_ERROR", `خطأ من Claude Code: ${stderr.trim().slice(0, 300)}`));
          } else {
            reject(error);
          }
        }
      });

      // السؤال عبر stdin: لا حد لطوله ولا مشاكل في ترميز سطر الأوامر على Windows
      child.stdin.end(request.prompt, "utf8");
    });
  }
}
