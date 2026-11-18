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
