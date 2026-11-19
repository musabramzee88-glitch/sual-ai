import { describe, expect, it } from "vitest";
import { cleanPageText, fixArabicLine, hasRealText, isGarbageText, reverseVisual } from "./text";

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

describe("isGarbageText (broken font encodings)", () => {
  const AR = "في هذا الدرس نتعلم كيف نجمع الأعداد الطبيعية ثم نقارن الناتج مع العدد الأول ونكتب الجواب في الدفتر. ";
  it("flags letter-by-letter Arabic and meaningless Latin; keeps real Arabic, math and English", () => {
    expect(isGarbageText([...AR.repeat(3)].join(" "))).toBe(true); // حرفاً حرفاً
    expect(isGarbageText("Ib dg Kjq xzv Pqw mnb vcx zlk jhg fds qwe rty uio pas dfg hjk lzx cvb nmq ".repeat(4))).toBe(true);
    expect(isGarbageText(AR.repeat(4))).toBe(false);
    expect(isGarbageText("حل المعادلة 3x + 5 = 20 ثم تحقق من الناتج y = 2x في الدفتر والكتاب والصفحة ".repeat(3))).toBe(false);
    expect(isGarbageText("Unit 2: Hello, my name is Sara. I am eight years old. This is my family and I like my school. What is your name? ".repeat(3))).toBe(false);
    expect(isGarbageText("")).toBe(false);
  });
});
