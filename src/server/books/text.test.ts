import { describe, expect, it } from "vitest";
import { cleanPageText, fixArabicLine, hasRealText, reverseVisual } from "./text";

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
