# سُؤال AI — Sual AI

منصة عراقية مدفوعة لإنشاء امتحانات مدرسية احترافية من المناهج العراقية (العام، المتميزين، الدولي) باستخدام الذكاء الاصطناعي.

- المتطلبات: [`docs/SPEC.md`](docs/SPEC.md)
- خطة المراحل وما يجب توفيره: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## التشغيل محلياً
```bash
cp .env.example .env          # ثم عدّل DATABASE_URL
npm install
npm run db:migrate
npm run db:seed
npm run dev
```
