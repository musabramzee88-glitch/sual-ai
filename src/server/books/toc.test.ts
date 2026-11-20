import { describe, expect, it } from "vitest";
import { parseTocEntries, proposeChapters } from "./toc";

const filler = (n: number) => `نص عادي للصفحة ${n} عن التمارين والأنشطة المختلفة`;
const pages = (n: number, set: Record<number, string>) => Array.from({ length: n }, (_, i) => ({ pageNumber: i + 1, text: set[i + 1] ?? filler(i + 1) }));

describe("TOC line parsing", () => {
  it("reads title … number and number … title lines, Arabic-Indic digits, and cleans titles", () => {
    const e = parseTocEntries(["المحتويات\nالفصل الأول: الأعداد الطبيعية ........ ٥\n12 .... الضرب\nالمقدمة ........ 3\n* - الدرس الثاني: الكسور 20"], 60);
    expect(e).toEqual([
      { title: "الفصل الأول: الأعداد الطبيعية", printed: 5 },
      { title: "الضرب", printed: 12 },
      { title: "الدرس الثاني: الكسور", printed: 20 },
    ]);
  });
  it("keeps the Arabic title of an OCR line whose page number is unreadable (Latin noise)", () => {
    const e = parseTocEntries(["محتويات الكتاب\n؛- dsl دخولي إلى المدرسة A\n5 - المدرسة ( للحفظ ) . 11"], 160);
    expect(e[0]).toEqual({ title: "دخولي إلى المدرسة", printed: null });
    expect(e[1]).toEqual({ title: "المدرسة ( للحفظ )", printed: 11 });
  });
});

describe("chapters from numbered contents", () => {
  const toc = "المحتويات\nالفصل الأول: الأعداد الطبيعية ........ 5\nالفصل الثاني: الكسور العادية ........ 20\nالفصل الثالث: الهندسة والقياس ........ ٣٥\nالفصل الرابع: الإحصاء ........ 48";
  const book = (extra: Record<number, string> = {}) => pages(60, {
    3: toc,
    9: "الفصل الأول الأعداد الطبيعية تمهيد", // مطبوعة 5 + فرق 4
    24: "الفصل الثاني الكسور العادية تمهيد",
    39: "الفصل الثالث الهندسة والقياس تمهيد",
    52: "الفصل الرابع الإحصاء تمهيد",
    ...extra,
  });
  it("finds the printed→file offset from the titles and uses the chapter level", () => {
    const r = proposeChapters(book(), 60)!;
    expect(r.method).toBe("numbers");
    expect(r.offset).toBe(4);
    expect(r.chapters.map((c) => [c.pageStart, c.pageEnd])).toEqual([[9, 23], [24, 38], [39, 51], [52, 60]]);
  });
  it("finds contents at the end of the book", () => {
    const p = book({ 3: filler(3), 60: toc });
    expect(proposeChapters(p, 60)!.chapters.map((c) => c.pageStart)).toEqual([9, 24, 39, 52]);
  });
  it("refuses to guess when titles cannot be located", () => {
    expect(proposeChapters(pages(60, { 3: toc }), 60)).toBeNull();
    expect(proposeChapters(pages(60, {}), 60)).toBeNull();
  });
  it("a unit+lessons book with only 2 units keeps the lessons (2 units would be too coarse)", () => {
    const t = "المحتويات\nالوحدة الأولى: أنا ومدرستي 5\nالدرس الأول: التحية والتعارف 7\nالدرس الثاني: أنا مرتب ومنظم 12\nالوحدة الثانية: أنا وأسرتي 20\nالدرس الأول: أنا ومشاعري 22\nالدرس الثاني: أعرف أسرتي 28";
    const p = pages(40, { 2: t, 5: "الوحدة الأولى أنا ومدرستي", 7: "التحية والتعارف", 12: "أنا مرتب ومنظم", 20: "الوحدة الثانية أنا وأسرتي", 22: "أنا ومشاعري", 28: "أعرف أسرتي" });
    expect(proposeChapters(p, 40)!.chapters.length).toBe(6);
  });
  it("rejects a contents list of one-page sections (paragraphs, not chapters)", () => {
    const lines = ["المحتويات", ...Array.from({ length: 20 }, (_, i) => `موضوع الفقرة رقم ${["أ", "ب", "ج", "د", "ه", "و", "ز", "ح", "ط", "ي"][i % 10]}${i} ........ ${i + 10}`)].join("\n");
    const set: Record<number, string> = { 3: lines };
    for (let i = 0; i < 20; i++) set[i + 10] = `موضوع الفقرة رقم ${["أ", "ب", "ج", "د", "ه", "و", "ز", "ح", "ط", "ي"][i % 10]}${i}`;
    expect(proposeChapters(pages(60, set), 60)).toBeNull();
  });
});

describe("chapters by title search when OCR destroyed the page numbers", () => {
  it("locates each lesson title in order (reading book: contents at the end, numbers read as Latin letters)", () => {
    const toc = "محتويات الكتاب\nت الموضوع رقم الصفحة\n؛- dsl دخولي إلى المدرسة A\nFall — A وتلاميذه السبعة 14x\nyw أحلام الراعي دا\n8 - الخليفة عمر والأعرابي LA";
    const p = pages(80, {
      79: toc,
      8: "أول دخولي إلى المدرسة كثيرا ما غمرني الشوق",
      20: "المعلم وتلاميذه السبعة قصة",
      35: "أحلام الراعي كان راع",
      50: "الخليفة عمر والأعرابي جاء",
    });
    const r = proposeChapters(p, 80)!;
    expect(r.method).toBe("titles");
    expect(r.chapters.map((c) => c.pageStart)).toEqual([8, 20, 35, 50]);
    expect(r.chapters[3].pageEnd).toBe(80);
  });
});
