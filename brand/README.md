# هوية «سُؤال AI»

| الملف | الاستعمال |
|---|---|
| `mark.svg` | الشعار بلا خلفية (على خلفية فاتحة) |
| `icon.svg` | أيقونة التطبيق (مربع مدوّر) — نفس الرسم في `src/components/Logo.tsx` |
| `icon-full.svg` | بملء المربع والشعار داخل المنطقة الآمنة: أيقونات maskable وآيفون |
| `icon-square.svg` / `play-icon-512.png` | أيقونة متجر Google Play (المتجر يدوّر الزوايا بنفسه) |
| `play-feature-1024x500.png` | الصورة العريضة في صفحة التطبيق على Google Play |
| `icon-1024.png`, `mark-1024.png` | نسخ كبيرة للإعلانات والطباعة |

الألوان: أخضر `#0B6560` · غامق `#06302E` · برتقالي «الإجابة» `#F5A524` · ورق `#F6F3EC`.
الخط في صور المشاركة: Noto Kufi Arabic (900) و Inter (800) لكلمة AI.

## إعادة توليد الصور
تُرسم كل الصور من ملفات SVG هنا بمتصفح Chromium (Playwright) بأحجامها الدقيقة:
`public/icons/icon-{192,512}.png` و`maskable-{192,512}.png` من `icon.svg`/`icon-full.svg`،
`src/app/apple-icon.png` (180) من `icon-full.svg`، `src/app/favicon.ico` (16/32/48) و`src/app/icon.svg` من `icon.svg`،
و`src/app/opengraph-image.png` (1200×630) و`play-feature-1024x500.png` من تصميم واحد: الأيقونة يميناً، «سُؤال AI»، «امتحانات احترافية من منهجك / بدقائق لا بساعات»، وأربع شارات.
