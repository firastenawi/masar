import { AppError } from "../../lib/errors";

/**
 * واجهة موحّدة لمزوّد الذكاء الاصطناعي. التطبيق لا يعرف إلا هذه الواجهة،
 * فتبديل Claude Code بـ API مباشر أو نموذج محلي = كتابة محوّل جديد فقط.
 */
export interface AiRequest {
  /** تعليمات ثابتة (لا تحتوي بيانات المستخدم) */
  system: string;
  /** السياق + المحادثة + السؤال الأخير */
  prompt: string;
  /** JSON Schema لرد منظّم؛ المزوّد يحاول الالتزام به */
  jsonSchema?: Record<string, unknown>;
}

export interface AiResult {
  text: string;
  /** الرد المنظّم إن وُجد (لم يُتحقق منه بعد) */
  structured: unknown;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string | null;
  complete(request: AiRequest): Promise<AiResult>;
}

/** أخطاء المزوّد برسائل يفهمها المستخدم ويعرف ماذا يفعل بعدها */
export class AiProviderError extends AppError {
  constructor(code: string, message: string, statusCode = 502) {
    super(statusCode, code, message);
    this.name = "AiProviderError";
  }
}
