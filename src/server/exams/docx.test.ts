import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { renderExamDocx, imageSize } from "./docx";
import { DEFAULT_TEMPLATE, type RenderExam } from "@/lib/exam-render";

// PNG 2×3 حقيقي (ترويسة IHDR صحيحة)
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAEElEQVR4nGP8z8DwHwwwAAAIAAL+eDgmAAAAAElFTkSuQmCC";
const PNG = `data:image/png;base64,${PNG_B64}`;

const exam: RenderExam = {
  lang: "AR", sectionsToAnswer: 2, firstRequired: true, forceShow: ["model"],
  values: { title: "الامتحان الشهري الأول", subject: "العلوم", grade: "الخامس الابتدائي", time: "٤٥ دقيقة", total: "٣٠ درجة", examKind: "الامتحان الشهري", school: "مدرسة الرافدين", teacher: "أ. علي", model: "ب" },
  sections: [
    { instruction: "اختر الإجابة الصحيحة:", marks: 10, type: "MCQ", answerCount: 1, branches: [{ prompt: "ناتج 2x + 3x يساوي:", options: ["5x", "6x", "7x"], answer: "5x", marks: 5, image: PNG }, { prompt: "عدد الأركان:", options: ["أربعة", "خمسة"], answer: "خمسة", marks: 5, table: { header: true, cells: [["الكمية", "القيمة"], ["", ""]] } }] },
    { instruction: "عرّف ما يأتي:", marks: 10, type: "DEFINE", branches: ["الخلية", "النسيج", "العضو"].map((p) => ({ prompt: p, options: null, answer: `تعريف ${p}`, marks: 3 })) },
    { instruction: "صح أو خطأ:", marks: 6, type: "TRUE_FALSE", branches: [{ prompt: "<script>alert(1)</script> الشمس نجم", options: null, answer: "صح", marks: 3 }] },
  ],
};
const xml = async (buf: Buffer) => (await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string"));
const text = (x: string) => [...x.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/\s+/g, " ");

describe("Word export", () => {
  it("is a valid .docx package with right-to-left Arabic paragraphs", async () => {
    const buf = await renderExamDocx(exam, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK"); // zip
    const z = await JSZip.loadAsync(buf);
    expect(Object.keys(z.files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "word/document.xml", "word/styles.xml"]));
    const x = await xml(buf);
    expect(x).toContain("<w:bidi"); // فقرات من اليمين لليسار
    expect(x).toContain("<w:rtl");
    expect(x).toContain("w:cs=\"Traditional Arabic\""); // خط النص المعقّد (العربي)
  });
  it("has the same content as the printed sheet: header, Iraqi numbering, notes, options, closing line", async () => {
    const t = text(await xml(await renderExamDocx(exam, { ...DEFAULT_TEMPLATE, signLine: true }, "QUESTIONS_ONLY")));
    for (const s of ["الامتحان الشهري الأول", "مدرسة الرافدين", "س١/", "١-", "٢-", "(١٠ درجة)", "ملاحظة: أجب عن سؤالين فقط", "والسؤال الأول إجباري", "أجب عن فرع واحد فقط مما يأتي:", "أ- 5x", "ب- 6x", "النموذج:", "مع تمنياتنا لكم بالنجاح والتوفيق", "معلم/ة المادة: أ. علي"]) expect(t, s).toContain(s);
    expect(t).toContain("الكمية");
    expect(t).not.toContain("تعريف الخلية"); // لا إجابات في نسخة الأسئلة
  });
  it("short definitions are laid out in one paragraph; answers and the key add the right letter", async () => {
    const q = text(await xml(await renderExamDocx(exam, DEFAULT_TEMPLATE, "QUESTIONS_ONLY")));
    expect(q).toMatch(/١- الخلية\s+٢- النسيج\s+٣- العضو/);
    const k = text(await xml(await renderExamDocx(exam, DEFAULT_TEMPLATE, "ANSWER_KEY")));
    expect(k).toContain("الإجابات النموذجية");
    expect(k).toContain("أ- 5x");
    expect(k).toContain("ب- خمسة");
    expect(k).not.toContain("اسم الطالب");
    const a = text(await xml(await renderExamDocx(exam, DEFAULT_TEMPLATE, "WITH_ANSWERS")));
    expect(a).toContain("الإجابة:");
  });
  it("embeds the image and the table, and escapes hostile text", async () => {
    const buf = await renderExamDocx(exam, DEFAULT_TEMPLATE, "QUESTIONS_ONLY");
    const z = await JSZip.loadAsync(buf);
    expect(Object.keys(z.files).some((f) => f.startsWith("word/media/"))).toBe(true);
    const x = await xml(buf);
    expect(x).toContain("<w:tbl>");
    expect(x).toContain("&lt;"); // نص مهرَّب داخل XML لا وسم حقيقي
    expect(x).not.toMatch(/<script/i);
    // الصورة لا تظهر في المفتاح ولا في ورقة الإجابة
    expect(Object.keys((await JSZip.loadAsync(await renderExamDocx(exam, DEFAULT_TEMPLATE, "ANSWER_KEY"))).files).some((f) => f.startsWith("word/media/"))).toBe(false);
  });
  it("answer sheet: bubbles only for objective items; page size and orientation follow the template", async () => {
    const s = text(await xml(await renderExamDocx(exam, DEFAULT_TEMPLATE, "ANSWER_SHEET")));
    expect(s).toContain("ورقة الإجابة");
    expect(s).toContain("س١ / ١");
    expect(s).toContain("○ صح");
    expect(s).not.toContain("تعريف");
    const a3 = await xml(await renderExamDocx(exam, { ...DEFAULT_TEMPLATE, pageSize: "A3", orientation: "LANDSCAPE" }, "QUESTIONS_ONLY"));
    expect(a3).toMatch(/<w:pgSz[^>]*w:w="23811"[^>]*w:h="16838"/); // A3 أفقي
  });
  it("reads PNG and JPEG sizes from the header, and refuses garbage", () => {
    expect(imageSize(Buffer.from(PNG_B64, "base64"))).toEqual({ w: 2, h: 3 });
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
    expect(imageSize(jpg)).toEqual({ w: 400, h: 300 });
    expect(imageSize(Buffer.from("not an image"))).toBeNull();
  });
});
