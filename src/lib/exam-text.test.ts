import { describe, expect, it } from "vitest";
import { HONOR, normalizeHonorifics, polishQuestion, stripLead } from "./exam-text";

const plain = (s: string) => s.replace(/ /g, " ");

describe("honorifics", () => {
  it("expands every form of the salawat to the full form, kept as one unbreakable unit", () => {
    for (const s of ["قال رسول الله (ص): إنما", "قال رسول الله ﷺ: إنما", "قال رسول الله (ﷺ): إنما", "قال رسول الله (صلى الله عليه وسلم): إنما", "قال رسول الله صلّى اللهُ عليهِ وآلهِ وسلّم: إنما", "قال رسول الله ( ص ): إنما"]) {
      expect(normalizeHonorifics(s)).toBe(`قال رسول الله ${HONOR.prophet}: إنما`);
    }
    expect(HONOR.prophet).not.toContain(" "); // مسافات غير قابلة للكسر فقط
    expect(plain(HONOR.prophet)).toBe("(صلى الله عليه وآله وسلم)");
  });
  it("prophets, companions and plurals get their full forms", () => {
    expect(plain(normalizeHonorifics("النبي موسى (ع) وعيسى (عليه السلام)"))).toBe("النبي موسى (عليه السلام) وعيسى (عليه السلام)");
    expect(plain(normalizeHonorifics("عمر بن الخطاب (رض) وأسماء بنت أبي بكر (رضي الله عنها)"))).toBe("عمر بن الخطاب (رضي الله عنه) وأسماء بنت أبي بكر (رضي الله عنها)");
    expect(plain(normalizeHonorifics("الأنبياء (عليهم السلام) والصحابة (رضي الله عنهم)"))).toBe("الأنبياء (عليهم السلام) والصحابة (رضي الله عنهم)");
    expect(plain(normalizeHonorifics("محمد(ص)"))).toBe("محمد (صلى الله عليه وآله وسلم)");
  });
  it("leaves other text and English untouched", () => {
    expect(normalizeHonorifics("الصف (ع) ليس هنا") ).toContain("(عليه"); // (ع) يُعدّ اختصاراً دائماً
    expect(normalizeHonorifics("Prophet Muhammad (pbuh)")).toBe("Prophet Muhammad (pbuh)");
    expect(normalizeHonorifics("ص ٢٣ من الكتاب")).toBe("ص ٢٣ من الكتاب");
  });
});

describe("instruction verb is not repeated in each item", () => {
  it("strips the section verb from the item", () => {
    expect(stripLead("DEFINE", "عرّف البناء الضوئي")).toBe("البناء الضوئي");
    expect(stripLead("DEFINE", "ما المقصود بالبناء الضوئي؟")).toBe("البناء الضوئي؟");
    expect(stripLead("JUSTIFY", "علّل: تحتاج النباتات إلى الضوء")).toBe("تحتاج النباتات إلى الضوء");
    expect(stripLead("COMPARE", "قارن بين الخلية النباتية والحيوانية")).toBe("الخلية النباتية والحيوانية");
    expect(stripLead("WRITE_HADITH", "اكتب الحديث الشريف الخاص بـ (إتقان العمل)")).toBe("(إتقان العمل)");
    expect(stripLead("WRITE_HADITH", "اكتب الحديث النبوي الشريف الذي يدل على بر الوالدين")).toBe("بر الوالدين");
    expect(stripLead("WHAT_IF", "ماذا يحدث لو انقطع الضوء عن النبات؟")).toBe("لو انقطع الضوء عن النبات؟");
    expect(stripLead("COMPLETE_VERSE", "أكمل الآية الكريمة: ﴿وَاعْتَصِمُوا بِحَبْلِ اللَّهِ ......﴾")).toBe("﴿وَاعْتَصِمُوا بِحَبْلِ اللَّهِ ......﴾");
    expect(stripLead("GRAMMAR_PARSING", "أعرب ما بين القوسين: جاء [الطالبُ]")).toBe("جاء [الطالبُ]");
    expect(stripLead("DEFINE", "Define photosynthesis")).toBe("photosynthesis");
  });
  it("keeps the item untouched when nothing meaningful would remain, or the type has no lead", () => {
    expect(stripLead("DEFINE", "عرّف")).toBe("عرّف");
    expect(stripLead("MCQ", "عرّف البناء الضوئي بأنه:")).toBe("عرّف البناء الضوئي بأنه:");
  });
  it("polishes prompt, answer and options together", () => {
    const r = polishQuestion("LIST", "AR", { prompt: "عدّد ثلاثاً من صفات النبي (ص)", answer: "الصدق", options: null });
    expect(plain(r.prompt)).toBe("ثلاثاً من صفات النبي (صلى الله عليه وآله وسلم)");
  });
});
