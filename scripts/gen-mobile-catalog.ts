/**
 * يولّد mobile/lib/catalog.g.dart من المصدر الوحيد في الموقع (أنواع الأسئلة، حقول الترويسة، الخطوط، الألوان…)
 * حتى لا تُكتب القوائم مرتين. التشغيل: npx tsx scripts/gen-mobile-catalog.ts
 * اختبار src/lib/mobile-catalog.test.ts يفشل إن نُسي تشغيله بعد تعديل المصدر.
 */
import { writeFileSync } from "node:fs";
import { mobileCatalog } from "../src/lib/mobile-catalog";

writeFileSync("mobile/lib/catalog.g.dart", mobileCatalog());
console.log("✔ mobile/lib/catalog.g.dart");
