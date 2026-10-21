# مَسار

منصة شخصية لإدارة التطور المهني والتدريب: مسارات ← مراحل ← مهام ← جلسات تعلم ← إتقان، مع مساعد ذكي يعمل باشتراكك في Claude.

## المتطلبات

- Node.js 22 أو أحدث (يُفضّل آخر إصدار 22.x)
- Claude Code مثبّت ومسجّل الدخول (للمساعد الذكي): `scripts\claude-login.ps1`

## الاستخدام اليومي

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-masar.ps1
```

ثم افتح http://localhost:3001. أول مرة يطلب منك ضبط كلمة مرور (من هذا الكمبيوتر فقط).

للتشغيل التلقائي عند تسجيل الدخول إلى Windows (في الخلفية):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-startup.ps1
```

وللإلغاء أضف `-Remove`.

## الوصول من الهاتف (Tailscale)

مَسار يعمل على الكمبيوتر فقط (لأن المساعد يستخدم Claude Code المثبّت عليه)، ولا يُفتح على الإنترنت العام. للوصول من الهاتف عبر اتصال مشفّر:

1. ثبّت [Tailscale](https://tailscale.com/download) على الكمبيوتر والهاتف، وسجّل الدخول بنفس الحساب.
2. في لوحة تحكم Tailscale فعّل **MagicDNS** و **HTTPS Certificates** (مرة واحدة).
3. شغّل مَسار، ثم في PowerShell على الكمبيوتر:
   ```powershell
   tailscale serve --bg 3001
   ```
   سيطبع رابطاً مثل `https://<اسم-الجهاز>.<اسم-الشبكة>.ts.net`.
4. افتح الرابط على الهاتف، سجّل الدخول، ثم «إضافة إلى الشاشة الرئيسية».

ملاحظات:
- الكمبيوتر يجب أن يكون يعمل ومتصلاً حتى يعمل مَسار من الهاتف.
- الرابط متاح فقط لأجهزتك في شبكة Tailscale، وليس للعامة.
- لإيقاف المشاركة: `tailscale serve reset`.
- أوامر Tailscale قد تتغير بين الإصدارات؛ عند أي خطأ راجع `tailscale serve --help`.

## النسخ الاحتياطي والاستعادة

- نسخة تلقائية يومية في `data\backups`، ونسخة قبل أي تحديث يغيّر شكل قاعدة البيانات.
- الاحتفاظ: آخر 14 نسخة + نسخة أسبوعية لـ 8 أسابيع.
- نسخة خارج الجهاز: اضبط `BACKUP_COPY_DIR` في `.env` على مجلد داخل OneDrive أو Google Drive.
- من الإعدادات: «نسخة احتياطية الآن» و«تصدير كل البيانات (JSON)».

الاستعادة (أوقف مَسار أولاً):

```powershell
npm run restore                      # يعرض النسخ المتاحة
npm run restore -- <اسم الملف>        # يستعيد، ويحفظ نسخة من الحالة الحالية قبلها
```

## للتطوير

```bash
npm install
copy .env.example .env
npm run dev
```

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | الخادم (3001) والواجهة (5173) مع إعادة التحميل التلقائي |
| `npm run build` | بناء الواجهة للاستخدام اليومي |
| `npm start` | تشغيل النسخة المبنية على المنفذ 3001 |
| `npm test` | كل الاختبارات |
| `npm run typecheck` | فحص الأنواع |
| `npm run db:generate` | migration جديد بعد تعديل `apps/server/src/db/schema.ts` |

## هيكل المشروع

```
apps/server     خادم Fastify + SQLite (Drizzle ORM) + المساعد + النسخ الاحتياطي
apps/web        واجهة React + Vite + Tailwind (RTL، قابلة للتثبيت PWA)
packages/shared مخططات Zod والدوال المشتركة
scripts/        تشغيل، تشغيل تلقائي، تسجيل دخول Claude، توليد الأيقونات
data/           قاعدة البيانات والنسخ والسجلات (غير مرفوع إلى Git)
```
