/**
 * نواة توليد الامتحان (دوال نقية، بلا DB ولا شبكة): مدخلات المعالج، نص التعليمات للنموذج، مخطط الرد،
 * والتحقق من الرد قبل حفظه. كل سؤال يجب أن يستند إلى صفحة من نطاق المصدر (لا أسئلة من خارج الكتاب).
 */
import { z } from "zod";
import { GENERATABLE_TYPES, QT, STYLE_BY_FAMILY, VERBATIM_TYPES, type QType } from "@/lib/question-types";
import { polishQuestion } from "@/lib/exam-text";

export const GENERATABLE = GENERATABLE_TYPES as unknown as [Exclude<QType, "DIAGRAM">, ...Exclude<QType, "DIAGRAM">[]];
export type GenType = Exclude<QType, "DIAGRAM">;
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD", "MIXED"] as const;
export const COGNITIVE = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"] as const;
export const EXAM_KINDS = ["QUIZ", "MONTHLY", "MIDTERM", "FINAL", "MINISTERIAL_STYLE"] as const;

export const MAX_QUESTIONS = 40;
export const MAX_PAGES = 80;

const section = z.object({
  type: z.enum(GENERATABLE),
  count: z.number().int().min(1).max(20),
  marksEach: z.number().int().min(1).max(50),
});

export const createExamSchema = z
  .object({
    curriculumId: z.string().min(10).max(40),
    chapterIds: z.array(z.string().min(10).max(40)).max(60).optional(),
    pageFrom: z.number().int().min(1).max(2000).optional(),
    pageTo: z.number().int().min(1).max(2000).optional(),
    title: z.string().trim().min(1).max(150).optional(),
    kind: z.enum(EXAM_KINDS).default("MONTHLY"),
    difficulty: z.enum(DIFFICULTIES).default("MIXED"),
    durationMinutes: z.number().int().min(5).max(300).optional(),
    sections: z.array(section).min(1).max(8),
    // الدرجة الكلية والتوزيع: smart (حسب نوع السؤال وصعوبته) أو equal (أقسام متساوية)؛ بلا totalMarks = درجة كل سؤال من القسم
    totalMarks: z.number().int().min(5).max(1000).optional(),
    distribution: z.enum(["smart", "equal"]).optional(),
  })
  .refine((v) => (v.chapterIds?.length ?? 0) > 0 || (v.pageFrom != null && v.pageTo != null && v.pageTo >= v.pageFrom), { message: "SOURCE_REQUIRED" })
  .refine((v) => v.sections.reduce((n, s) => n + s.count, 0) <= MAX_QUESTIONS, { message: "TOO_MANY_QUESTIONS" })
  .refine((v) => new Set(v.sections.map((s) => s.type)).size === v.sections.length, { message: "DUPLICATE_SECTION" });
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type Section = z.infer<typeof section>;

export const instructionFor = (type: GenType, lang: "AR" | "EN") => (lang === "EN" ? QT[type].instEn : QT[type].instAr);

export type SourcePage = { pageNumber: number; text: string; isOcr: boolean; asImage: boolean };

/** نص الطلب للنموذج: المنهج، المصدر بأرقام صفحاته، وأقسام الامتحان المطلوبة */
export function buildPrompt(opts: {
  subject: string; grade: string; lang: "AR" | "EN"; difficulty: (typeof DIFFICULTIES)[number]; useLatinSymbols: boolean;
  sections: Section[]; pages: SourcePage[]; avoid?: string[]; family?: string; samples?: string[];
}): string {
  const ocrImg = opts.pages.filter((p) => p.asImage).map((p) => p.pageNumber);
  const ocrText = opts.pages.filter((p) => p.isOcr && !p.asImage).map((p) => p.pageNumber);
  const lines = [
    `You are an experienced Iraqi school teacher writing an exam for: ${opts.subject} — ${opts.grade}.`,
    `Write every question and answer in ${opts.lang === "EN" ? "English" : "Modern Standard Arabic (فصحى) as used in Iraqi Ministry of Education exams"}.`,
    "STRICT RULES:",
    "- Use ONLY content that appears in the source pages below. Never use outside knowledge or other grades' content.",
    "- Every question MUST list in sourcePages the page number(s) (from the === صفحة N === markers / image labels) where its content appears.",
    "- Questions must be clear, unambiguous, age-appropriate, and each must have exactly one correct answer (for closed types).",
    "- Do not repeat or trivially rephrase the same idea in two questions. Spread questions across the source pages.",
    "- The paper prints each section's instruction ONCE above its items (e.g. «عرّف ما يأتي:»). Each item must NOT repeat that verb: write «البناء الضوئي» not «عرّف البناء الضوئي».",
    opts.lang === "AR" ? "- Honorifics in full, never abbreviated: after the Prophet Muhammad write (صلى الله عليه وآله وسلم), after any other prophet (عليه السلام), after a companion (رضي الله عنه/عنها/عنهم). Never write (ص) or (ع) or (رض)." : "",
    `- Iraqi exam style for this subject: ${STYLE_BY_FAMILY[opts.family ?? "OTHER"] ?? STYLE_BY_FAMILY.OTHER}`,
    "- Model answers: complete and precise as a teacher's answer key, in the book's own wording, short where the question is short.",
    opts.sections.some((x) => VERBATIM_TYPES.includes(x.type)) ? "- Quran verses, hadiths and memorised poems must be copied CHARACTER-FOR-CHARACTER from the source pages. If a section cannot be filled from text that is actually printed in the source, write fewer questions for it — never quote from memory." : "",
    `- Difficulty: ${opts.difficulty === "MIXED" ? "a balanced mix of EASY, MEDIUM and HARD" : opts.difficulty}.`,
    opts.useLatinSymbols ? "- Write mathematical expressions with Latin symbols (x, y, a, b) and normal digits, as in Iraqi math books." : "",
    ocrImg.length ? `- Pages ${ocrImg.join(", ")} are attached as IMAGES (their extracted text is unreliable): read their content from the images.` : "",
    ocrText.length ? `- The text of pages ${ocrText.join(", ")} was read by OCR and may contain errors, especially in numbers. Do not copy numbers from these pages unless they are unambiguous.` : "",
    "",
    "SECTIONS TO WRITE (section index, type, number of questions):",
    ...opts.sections.map((s, i) => `  section ${i}: ${s.type} × ${s.count} — ${QT[s.type].hint}`),
    opts.avoid?.length ? `\nDo NOT repeat these existing questions:\n${opts.avoid.map((a) => `  - ${a.slice(0, 200)}`).join("\n")}` : "",
    "",
    ...(opts.samples?.length ? [
      "REFERENCE PAPERS — real exam papers written by Iraqi teachers of this subject. Your paper must read as if the SAME teacher wrote it:",
      "  * word each section instruction exactly the way these papers word instructions for that question type (return them in sectionInstructions);",
      "  * phrase, number, and size the items exactly like theirs (same sentence patterns, same blanks style ……, same option style, same level and length);",
      "  * model answers in the form these teachers expect.",
      "  * NEVER copy their questions, facts or examples: every question's content must come from the SOURCE PAGES.",
      ...opts.samples.map((t, i) => `--- reference paper ${i + 1} ---\n${t}\n--- end of reference paper ${i + 1} ---`),
      "",
    ] : []),
    "SOURCE PAGES:",
    ...opts.pages.filter((p) => !p.asImage).map((p) => `=== صفحة ${p.pageNumber} ===\n${p.text}`),
    ...opts.pages.filter((p) => p.asImage).map((p) => `=== صفحة ${p.pageNumber} === (see attached image labelled page ${p.pageNumber})`),
  ];
  return lines.filter((l) => l !== "").join("\n");
}

/** مخطط رد Gemini (OpenAPI subset، أنواع بأحرف كبيرة) */
export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          section: { type: "INTEGER" },
          prompt: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          answer: { type: "STRING" },
          sourcePages: { type: "ARRAY", items: { type: "INTEGER" } },
          difficulty: { type: "STRING", enum: ["EASY", "MEDIUM", "HARD"] },
          cognitiveLevel: { type: "STRING", enum: [...COGNITIVE] },
        },
        required: ["section", "prompt", "answer", "sourcePages"],
      },
    },
    // تعليمة كل قسم بصياغة المدرسين (تُستعمل حين توجد أوراق مرجع)
    sectionInstructions: { type: "ARRAY", items: { type: "OBJECT", properties: { section: { type: "INTEGER" }, instruction: { type: "STRING" } }, required: ["section", "instruction"] } },
  },
  required: ["questions"],
};

export type RawQuestion = { section?: number; prompt?: string; options?: string[]; answer?: string; sourcePages?: number[]; difficulty?: string; cognitiveLevel?: string };
export type CleanQuestion = { prompt: string; options: string[] | null; answer: string; sourcePages: number[]; difficulty: "EASY" | "MEDIUM" | "HARD" | null; cognitiveLevel: (typeof COGNITIVE)[number] | null };

/**
 * تطبيع للمقارنة: يزيل كل علامات التشكيل والعلامات القرآنية (\p{M} تشمل علامات الوقف والألف الخنجرية)،
 * ويوحّد أشكال الألف (ٱ أ إ آ) والياء (ى) فيطابق الرسم العثماني في الكتب رسمَ النموذج العادي.
 */
const norm = (s: string) =>
  s.normalize("NFKC").replace(/[\p{M}\u0640\u06DE\u06DD]/gu, "").replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627").replace(/\u0649/g, "\u064A").replace(/\s+/g, " ").trim().toLowerCase();

/** ينظّف سؤالاً واحداً لنوعه؛ null إن لم يصلح (يُسقط ولا يُحفظ) */
/** صفحات المصدر للتحقق: النص الموثوق (طبقة نص، لا OCR ولا صورة) يُستعمل لمطابقة النصوص المنقولة حرفياً */
export type PageRef = { text: string; trusted: boolean };

const tokens = (s: string) => norm(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 2);

/**
 * نص منقول حرفياً (آية، حديث، بيت شعر): 85% على الأقل من كلماته موجودة في نص إحدى الصفحات الموثوقة المذكورة.
 * إن كانت كل الصفحات المذكورة صوراً/OCR لا يمكن التحقق آلياً فيُقبل (والواجهة تطلب من المدرس مطابقته).
 */
export function verbatimOk(text: string, cited: number[], pages: Map<number, PageRef>): boolean {
  const trusted = cited.map((n) => pages.get(n)).filter((p): p is PageRef => !!p && p.trusted);
  if (trusted.length === 0) return true;
  const want = tokens(text);
  if (want.length === 0) return false;
  return trusted.some((p) => {
    const have = new Set(tokens(p.text));
    return want.filter((w) => have.has(w)).length / want.length >= 0.85;
  });
}

export function cleanQuestion(q: RawQuestion, type: GenType, allowedPages: Set<number> | Map<number, PageRef>, lang: "AR" | "EN"): CleanQuestion | null {
  const prompt = String(q.prompt ?? "").trim();
  let answer = String(q.answer ?? "").trim();
  if (prompt.length < 3 || prompt.length > 1500 || answer.length < 1 || answer.length > 3000) return null;
  // لا سؤال بلا صفحة مصدر داخل النطاق
  const sourcePages = [...new Set((q.sourcePages ?? []).filter((n) => Number.isInteger(n) && allowedPages.has(n)))].sort((a, b) => a - b);
  if (sourcePages.length === 0) return null;
  // القرآن والحديث والشعر: النص المنقول (الجواب، ومعه بداية الآية في السؤال) يجب أن يطابق الكتاب
  if (VERBATIM_TYPES.includes(type) && allowedPages instanceof Map) {
    const quoted = type === "COMPLETE_VERSE" || type === "COMPLETE_POEM" ? `${prompt.replace(/[.…]{2,}/g, " ")} ${answer}` : answer;
    if (!verbatimOk(quoted, sourcePages, allowedPages)) return null;
  }
  let options: string[] | null = null;
  if (type === "MCQ") {
    const opts = [...new Set((q.options ?? []).map((o) => String(o).trim()).filter(Boolean))];
    if (opts.length < 3 || opts.length > 5) return null;
    // الجواب يطابق خياراً (بعد التطبيع)، أو حرف الخيار (أ/ب/ج/د أو a/b/c/d)
    const letters = lang === "EN" ? ["a", "b", "c", "d", "e"] : ["أ", "ب", "ج", "د", "هـ"];
    const byLetter = letters.findIndex((l) => norm(answer).replace(/[).\s]/g, "") === norm(l));
    const match = opts.find((o) => norm(o) === norm(answer)) ?? (byLetter >= 0 ? opts[byLetter] : undefined) ?? opts.find((o) => norm(answer).includes(norm(o)) && norm(o).length >= 2);
    if (!match) return null;
    options = opts;
    answer = match;
  }
  if (type === "TRUE_FALSE") {
    const a = norm(answer);
    // \b لا يعمل مع العربية في JS: الحدّ مسافة أو علامة أو نهاية
    const isTrue = /^(صح|صحيح|true|t)(?=$|[\s\-–—:.,،])/.test(a);
    const isFalse = /^(خطا|خاطئ|خاطئه|false|f)(?=$|[\s\-–—:.,،])/.test(a);
    if (isTrue === isFalse) return null;
    const correction = answer.replace(/^[^-–—:]*[-–—:]\s*/, "").trim();
    answer = (lang === "EN" ? (isTrue ? "True" : "False") : isTrue ? "صح" : "خطأ") + (isFalse && correction && correction !== answer ? ` — ${correction}` : "");
  }
  // الصيغ الكاملة للصلاة والترضّي، وحذف فعل التعليمة المكرر (بعد التحقق الحرفي)
  const polished = polishQuestion(type, lang, { prompt, answer, options });
  const difficulty = q.difficulty === "EASY" || q.difficulty === "MEDIUM" || q.difficulty === "HARD" ? q.difficulty : null;
  const cognitiveLevel = (COGNITIVE as readonly string[]).includes(q.cognitiveLevel ?? "") ? (q.cognitiveLevel as CleanQuestion["cognitiveLevel"]) : null;
  return { prompt: polished.prompt, options: polished.options, answer: polished.answer, sourcePages, difficulty, cognitiveLevel };
}

/** يوزّع رد النموذج على الأقسام: تنظيف، إزالة المكرر، والاقتصار على العدد المطلوب */
export function sortIntoSections(raw: RawQuestion[], sections: Section[], allowedPages: Set<number> | Map<number, PageRef>, lang: "AR" | "EN"): { bySection: CleanQuestion[][]; dropped: number } {
  const bySection: CleanQuestion[][] = sections.map(() => []);
  const seen = new Set<string>();
  let dropped = 0;
  for (const q of raw) {
    const i = Number(q.section);
    if (!Number.isInteger(i) || i < 0 || i >= sections.length || bySection[i].length >= sections[i].count) { dropped++; continue; }
    const c = cleanQuestion(q, sections[i].type, allowedPages, lang);
    const key = c ? norm(c.prompt) : "";
    if (!c || seen.has(key)) { dropped++; continue; }
    seen.add(key);
    bySection[i].push(c);
  }
  return { bySection, dropped };
}

/** صفحات المصدر التي تُرسل صوراً: صفحات OCR أولاً موزّعة بالتساوي، حتى الحد */
export function pickImagePages(pages: { pageNumber: number; isOcr: boolean; textLen: number }[], max: number): Set<number> {
  const weak = pages.filter((p) => p.isOcr || p.textLen < 80).map((p) => p.pageNumber);
  if (weak.length <= max) return new Set(weak);
  const step = weak.length / max;
  return new Set(Array.from({ length: max }, (_, i) => weak[Math.floor(i * step)]));
}

/** يوسّع الفصول/النطاق إلى قائمة صفحات (مرتبة، بلا تكرار) ويقطعها عند الحد */
export function expandRanges(ranges: { from: number; to: number }[], pageCount: number, max = MAX_PAGES): { pages: number[]; truncated: boolean } {
  const set = new Set<number>();
  for (const r of ranges) for (let n = Math.max(1, r.from); n <= Math.min(pageCount, r.to); n++) set.add(n);
  const all = [...set].sort((a, b) => a - b);
  if (all.length <= max) return { pages: all, truncated: false };
  // عيّنة موزّعة على كامل النطاق (لا أول الصفحات فقط)
  const step = all.length / max;
  return { pages: Array.from({ length: max }, (_, i) => all[Math.floor(i * step)]), truncated: true };
}

/**
 * تعليمة القسم: صياغة النموذج المقتبسة من أوراق المرجع إن صلحت (سطر واحد قصير بلغة الامتحان)، وإلا التعليمة الافتراضية للنوع.
 */
export function chooseInstruction(type: GenType, lang: "AR" | "EN", fromModel: string | undefined, hasSamples: boolean): string {
  const def = instructionFor(type, lang);
  if (!hasSamples || !fromModel) return def;
  const t = fromModel.replace(/\s+/g, " ").trim().replace(/^(?:س\s*[٠-٩0-9]+\s*[/:：\-–]\s*|Q\s*\d+\s*[/:.\-–]\s*)/i, "");
  if (t.length < 4 || t.length > 160) return def;
  if (lang === "AR" ? !/[\u0600-\u06FF]{3,}/.test(t) : !/[A-Za-z]{3,}/.test(t)) return def;
  return t;
}

