/**
 * حدّ بسيط في الذاكرة لمحاولات تسجيل الدخول الفاشلة (لكل عنوان IP).
 * يكفي لتطبيق شخصي: يمنع تخمين كلمة المرور بالتجربة السريعة.
 */
export class FailureLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
  ) {}

  /** عدد الثواني المتبقية إن كان المفتاح محظوراً، وإلا 0 */
  blockedFor(key: string, now = Date.now()): number {
    const entry = this.failures.get(key);
    if (!entry || entry.resetAt <= now) return 0;
    return entry.count >= this.maxFailures ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }

  fail(key: string, now = Date.now()) {
    const entry = this.failures.get(key);
    if (!entry || entry.resetAt <= now) {
      this.failures.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count += 1;
    }
  }

  reset(key: string) {
    this.failures.delete(key);
  }
}
