# سُؤال AI — دليل العمل على المستودع

منصة امتحانات مدفوعة للمدرسين العراقيين. المتطلبات: `docs/SPEC.md` · المراحل: `docs/ROADMAP.md`.

## التقنية
Next.js 15 (App Router, full-stack) · TypeScript · Tailwind v4 · Prisma 6 + PostgreSQL · Zod · Vitest.

## الأوامر
```
npm run dev          # خادم التطوير
npm run db:migrate   # إنشاء/تطبيق migration
npm run db:seed      # البيانات المرجعية (idempotent)
npm test             # Vitest (يحتاج قاعدة بيانات مزروعة)
npm run typecheck && npm run lint && npm run build
```

## البنية
- `prisma/schema.prisma` — المخطط الكامل لكل المراحل. قيود SQL إضافية (فهارس جزئية، CHECK) تُكتب يدوياً داخل ملفات migration.
- `prisma/seed-data.ts` — بيانات العراق المرجعية (مراحل، صفوف، مسارات عام/متميزين/دولي، فروع، مواد، محافظات ومديريات). لا أسعار ولا مناهج وهمية.
- `src/server/*` — كود الخادم فقط (`import "server-only"`): db، env، خدمات المجال، أدوات HTTP.
- `src/lib/access.ts` — `resolveAccess()` هو مصدر الحقيقة الوحيد للوصول للخدمات المدفوعة؛ يُستدعى على الخادم في كل مسار مدفوع.
- `src/lib/i18n` — قواميس AR/EN؛ اللغة في cookie `locale`. لا تمرر دوالاً من القاموس إلى Client Components.
- `src/app/api/v1/*` — REST API؛ تحقق من المدخلات بـ Zod (`codeSchema` للرموز المرجعية) وأرجع `{data}` أو `{error:{code,message}}`.

## قواعد
- كل منع/صلاحية يُطبَّق على الخادم، لا في الواجهة.
- لا أسرار في الكود أو الواجهة؛ متغيرات البيئة تُقرأ عبر `src/server/env.ts`.
- الرموز السرية (كلمات مرور، OTP، رموز جلسات) تُخزَّن كـ hash فقط ولا تُطبع في السجلات.
- المبالغ بالدينار كأعداد صحيحة.
- النصوص الرياضية داخل جمل عربية تُعزل بـ `dir="ltr"` + `unicode-bidi: isolate`.
- لا يُعرض محتوى توضيحي على أنه ناتج حقيقي للذكاء الاصطناعي.

## الإدارة والاشتراكات (المرحلة 2)
- `src/server/admin/guard.ts` — `requireAdmin(perm)` (API) و`requireAdminPage(perm)` (صفحات): دور + سجل `AdminUser` فعّال + صلاحية؛ `SUPER_ADMIN` يملك كل الصلاحيات. لا تعتمد على إخفاء الأزرار.
- كل إجراء إداري يكتب `audit(tx, …)` داخل **نفس المعاملة**؛ لا تكتب سجل التدقيق خارجها.
- `src/server/billing/service.ts` — تدفق الدفع النقدي؛ الموافقة تحجز الحالة بـ `updateMany` شرطي (لا تفعيل مزدوج)، ولا يتجاوز أي كود قيود الفهارس الجزئية.
- مسارات `src/app/api/v1/admin/*` تمر عبر `adminMutation`/`adminRead` في `src/server/admin/route.ts` (صلاحية + حد معدّل + Zod).
- `npm run admin:create` — إنشاء/ترقية المدير الرئيسي (لا كلمات مرور في الكود).

## التحقق والدخول (قناة واحدة أو اثنتان)
- `src/server/auth/otp.ts`: `issueOtp(user, channel, …)` و`verifyOtps([...])` (الكل أو لا شيء). معرّف التحدّي `E_<id>` للبريد و`P_<id>` للهاتف.
- `src/server/auth/sms.ts`: لا مزوّد SMS مركَّب بعد؛ `smsAvailable()` هو الحكم الوحيد لإتاحة الهاتف. لا تفترض توفر SMS في الواجهة، واقرأ `/api/v1/auth/channels`.
- `login()` يحدد القناة بما كتبه المستخدم؛ وضع `loginSecurity=BOTH` يصدر رمزين ولا يقبل الجهاز الموثوق.

## إدارة المناهج (المرحلة 2ب)
- `src/server/admin/curriculum.ts`: `createEntity/updateEntity(kind, …)` لكل الأنواع، و`replaceChapters` (استبدال القائمة كاملة ذرّياً). أضف نوعاً جديداً بإضافته إلى `schemas`.
- الرمز ثابت بعد الإنشاء؛ لا حذف للمرجعي (تعطيل). فرادة المنهج مع NULL مفروضة بفهرس تعبيري في migration `curriculum_unique_nulls`.
- `prisma/seed.ts` يضيف المفقود فقط — لا تجعله يعيد كتابة بيانات تديرها الإدارة.

## الكتب واستخراج النص (المرحلة 3)
- `src/server/books/text.ts` (دوال نقية): `assembleLines` يرتّب حسب الموضع، `visualVotes` يكشف الكلمات المقلوبة بأشكال العرض العربية (جدول مولَّد من unicodedata — لا يُعدَّل يدوياً). أي تعديل يجب أن يمر باختبارات `extract.test.ts` على `test/fixtures`.
- `src/server/books/service.ts`: الرفع/المعالجة/الربط/الحذف. المعالجة تحجز الكتاب بـ `updateMany` شرطي. المسار المخزَّن يولَّد داخلياً ويُتحقق أنه داخل `STORAGE_DIR`.
- الرفع multipart يمر بالـ middleware؛ لذلك `experimental.middlewareClientMaxBodySize` في `next.config.ts`.
