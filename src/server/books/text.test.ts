import { describe, expect, it } from "vitest";
import { chooseBest, cleanPageText, fixArabicLine, hasRealText, isGarbageText, reverseVisual, singleLetterShare, textQuality, unreliableArabic } from "./text";

describe("arabic text cleanup", () => {
  it("normalizes presentation forms and removes tatweel / bidi marks", () => {
    expect(cleanPageText("ﺍﻟﺪﺭﺱ‏ الأول ـــ")).toBe("الدرس الأول");
  });
  it("leaves a correctly ordered Arabic line unchanged", () => {
    const l = "اكتب الجواب في الدفتر ثم أجب عن الأسئلة";
    expect(fixArabicLine(l)).toBe(l);
  });
  it("fixes a visually reversed line and keeps numbers/latin readable", () => {
    const logical = "أجب عن السؤال في الصفحة 25 من الكتاب";
    const visual = reverseVisual(logical); // كما تخزّنه بعض ملفات PDF
    expect(visual).not.toBe(logical);
    expect(fixArabicLine(visual)).toBe(logical);
  });
  it("does not touch English lines", () => {
    expect(fixArabicLine("Unit 3: My family")).toBe("Unit 3: My family");
  });
  it("detects pages without real text (scanned)", () => {
    expect(hasRealText("")).toBe(false);
    expect(hasRealText("12 . ـ")).toBe(false);
    expect(hasRealText("الدرس الأول: الأعداد الطبيعية وخصائصها في الرياضيات للصف الرابع الابتدائي")).toBe(true);
  });
});

describe("cleanPageText: Symbol/Wingdings private-use glyphs", () => {
  it("turns F020 into a space, keeps math symbols, drops decorative icons", () => {
    expect(cleanPageText("12\uF0B4\uF0203 =\uF02036")).toBe("12× 3 = 36");
    expect(cleanPageText("6\uF0B84\uF0B1\uF0A5 \uF06E\uF047 نص")).toBe("6÷4±∞ نص");
    expect(cleanPageText("\uF06E\uF047\uF068")).toBe("");
  });
});

describe("isGarbageText (broken font encodings)", () => {
  const AR = "في هذا الدرس نتعلم كيف نجمع الأعداد الطبيعية ثم نقارن الناتج مع العدد الأول ونكتب الجواب في الدفتر. ";
  it("flags letter-by-letter Arabic and meaningless Latin; keeps real Arabic, math and English", () => {
    expect(isGarbageText([...AR.repeat(3)].join(" "))).toBe(true); // حرفاً حرفاً
    expect(isGarbageText("Ib dg Kjq xzv Pqw mnb vcx zlk jhg fds qwe rty uio pas dfg hjk lzx cvb nmq ".repeat(4))).toBe(true);
    expect(isGarbageText(AR.repeat(4))).toBe(false);
    expect(isGarbageText("حل المعادلة 3x + 5 = 20 ثم تحقق من الناتج y = 2x في الدفتر والكتاب والصفحة ".repeat(3))).toBe(false);
    expect(isGarbageText("Unit 2: Hello, my name is Sara. I am eight years old. This is my family and I like my school. What is your name? ".repeat(3))).toBe(false);
    expect(isGarbageText("")).toBe(false);
    // انحدار فعلي: صفحة مفردات إنكليزية سليمة (بلا كلمات رابطة تقريباً) لا تُعدّ فاسدة
    expect(isGarbageText("apple banana orange pencil bag book desk chair table window door teacher student school garden flower river mountain picture bridge market kitchen bedroom library ".repeat(3))).toBe(false);
  });
});

// عيّنات حرفية من كتب المستخدم الفعلية (تقرير books:check --deep)
describe("real samples from Iraqi textbooks", () => {
  const rep = (t: string, n = 12) => Array.from({ length: n }, () => t).join("\n");

  it("vowelized Arabic with detached diacritics is GOOD text (regression: it was emptied as 'letter-by-letter')", () => {
    const vowelized = rep("المُقَدِّمَة ُكَان َ تَأْلِيْف ِّكِتَاب ُ (اللُّغَة ِ العَرَبِيَّة ِ) ُ يُسْعِدُنَا أَن ْ نُقَدِّم َ لَكُم ْ هَذَا ِّكِتَاب َ");
    expect(singleLetterShare(vowelized)).toBeLessThan(0.5);
    expect(isGarbageText(vowelized)).toBe(false);
    expect(isGarbageText(rep("فِدَاء ٌ لِوَطَنِي ُ الوَحْدَة ُ األُوْلَى ( بِيْئَتُنَا ) ٌُ المُقَدِّمَة ِِيُعَد ُّ كِتَاب ُ (اللُّغ"))).toBe(false);
  });

  it("still catches true letter-by-letter Arabic", () => {
    expect(isGarbageText(rep([..."المقدمة كان تأليف كتاب اللغة العربية"].join(" ")))).toBe(true);
  });

  it("Arabic drawn with Latin-1/math symbols is garbage (Latin-mapped glyph codes)", () => {
    expect(isGarbageText(rep("áneqón≤aodG è pgÉnæn rŸG p ôjpƒ r£nJ ≈n∏ pÉãc oå oÉf ∫pÉ"))).toBe(true);
  });

  it("Arabic words polluted with Latin letters/symbols instead of letters/vowels are unreliable", () => {
    expect(unreliableArabic(rep("lمn≤oدuمnة qمoوnاكبة v لnلتطوuرp العpلrم"))).toBe(true);
    expect(isGarbageText(rep("lمn≤oدuمnة qمoوnاكبة v لnلتطوuرp العpلrم"))).toBe(true);
  });

  it("U+FFFD inside Arabic words (lost/swapped letters such as sin/sad/shin) is unreliable", () => {
    expect(isGarbageText(rep("ُ تُركِّز ُ �صِل�ْصلة ُ كُتب ِ العلوم الم�سرف العلمي ت�أليف م�َسْرُوع الف�صل الثالث"))).toBe(true);
    // رمز واحد شارد في صفحة سليمة لا يكفي
    expect(isGarbageText(rep("هذا نص عربي سليم تماماً ويتحدث عن الأعداد والجمع والطرح في الدفتر ", 8) + "\nكلمة � واحدة")).toBe(false);
  });

  it("normal Arabic, Arabic math with Latin variables, and English stay good", () => {
    expect(isGarbageText(rep("في هذا الدرس نتعلم كيف نجمع الأعداد الطبيعية ثم نقارن الناتج مع العدد الأول ونكتب الجواب"))).toBe(false);
    expect(isGarbageText(rep("حل المعادلة 3x + 5 = 20 ثم تحقق من الناتج y = 2x في الدفتر والكتاب والصفحة", 6))).toBe(false);
    expect(isGarbageText(rep("Unit 2: Hello, my name is Sara. I am eight years old. This is my family and I like my school."))).toBe(false);
  });
});

describe("page-level arbitration between a broken text layer and OCR", () => {
  const rep = (t: string, n = 10) => Array.from({ length: n }, () => t).join("\n");
  const cleanAr = rep("في هذا الدرس نتعلم كيف نجمع الأعداد الطبيعية ثم نقارن الناتج مع العدد الأول ونكتب الجواب في الدفتر");
  const latinMapped = rep("áneqón≤aodG è pgÉnæn rŸG p ôjpƒ r£nJ ≈n∏ pÉãc oå oÉf ∫pÉ");
  const ocrVowelized = rep("كانls Callاللعة ٭ad salللصف ¢الأول الابدائيLies أن§838 لكمhذا الكتابf ~~ ^^");
  const layerFffd = rep("المقدمة كانت �صِل�ْصلة ُ كتب العلوم الم�سرف العلمي ت�أليف الف�صل الثالث في هذا الكتاب");
  const layerClean = rep("المقدمة كانت صلصلة كتب العلوم المشرف العلمي تأليف الفصل الثالث في هذا الكتاب");

  it("scores clean Arabic far above Latin-mapped garbage, with FFFD/mixed text in between", () => {
    expect(textQuality(cleanAr)).toBeGreaterThan(0.8);
    expect(textQuality(latinMapped)).toBeLessThan(0.5);
    expect(textQuality(cleanAr)).toBeGreaterThan(textQuality(latinMapped) + 0.4);
    expect(textQuality(ocrVowelized)).toBeLessThan(textQuality(layerClean));
    expect(textQuality("قصير")).toBe(0);
  });

  it("prefers OCR when the layer is hopeless; prefers the layer when OCR garbles vowelized text", () => {
    expect(chooseBest(cleanAr, latinMapped)?.source).toBe("ocr");
    expect(chooseBest(ocrVowelized, layerFffd)?.source).toBe("layer");
    expect(chooseBest(ocrVowelized, layerFffd)?.text).not.toContain("\uFFFD"); // يُنظَّف من FFFD
  });

  it("OCR wins ties; nothing usable returns null; a poor layer alone is not stored", () => {
    expect(chooseBest(cleanAr, cleanAr)?.source).toBe("ocr");
    expect(chooseBest(null, latinMapped)).toBeNull();
    expect(chooseBest("", "")).toBeNull();
    expect(chooseBest(null, layerFffd)?.source).toBe("layer"); // طبقة بجودة كافية تُحفظ عند غياب OCR
  });

  it("NUL/control characters from fonts without ToUnicode are removed", () => {
    expect(cleanPageText("الل\u0000غة\u0001 العربية")).toBe("اللغة العربية");
  });
});
