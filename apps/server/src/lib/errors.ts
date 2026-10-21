/** خطأ متوقَّع برسالة مفهومة للمستخدم؛ معالج الأخطاء المركزي يرسله كما هو */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} غير موجود`);

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
