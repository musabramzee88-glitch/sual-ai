/**
 * نواة توليد الامتحان (دوال نقية، بلا DB ولا شبكة): مدخلات المعالج، نص التعليمات للنموذج، مخطط الرد،
 * والتحقق من الرد قبل حفظه. كل سؤال يجب أن يستند إلى صفحة من نطاق المصدر (لا أسئلة من خارج الكتاب).
 */
import { z } from "zod";

export const GENERATABLE = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "JUSTIFY", "DEFINE", "COMPARE", "PROBLEM", "PROOF", "ESSAY", "APPLIED", "COMPREHENSION", "GRAMMAR_PARSING", "EQUATION_BALANCING"] as const;
export type GenType = (typeof GENERATABLE)[number];
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
  })
  .refine((v) => (v.chapterIds?.length ?? 0) > 0 || (v.pageFrom != null && v.pageTo != null && v.pageTo >= v.pageFrom), { message: "SOURCE_REQUIRED" })
  .refine((v) => v.sections.reduce((n, s) => n + s.count, 0) <= MAX_QUESTIONS, { message: "TOO_MANY_QUESTIONS" })
  .refine((v) => new Set(v.sections.map((s) => s.type)).size === v.sections.length, { message: "DUPLICATE_SECTION" });
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type Section = z.infer<typeof section>;

/** تعليمات كل نوع بأسلوب الامتحانات العراقية (عربي/إنكليزي) */
export const INSTRUCTIONS: Record<GenType, { ar: string; en: string; hint: string }> = {
  MCQ: { ar: "اختر الإجابة الصحيحة لكل مما يأتي:", en: "Choose the correct answer:", hint: "four options exactly; answer must equal one option verbatim" },
  TRUE_FALSE: { ar: "ضع كلمة (صح) أمام العبارة الصحيحة وكلمة (خطأ) أمام العبارة الخاطئة:", en: "Write True or False:", hint: "a statement; answer is صح/خطأ (or True/False for English); for خطأ add the correction after a dash" },
  FILL_BLANK: { ar: "املأ الفراغات الآتية بما يناسبها:", en: "Fill in the blanks:", hint: "use ...... for each blank; answer lists the missing words in order" },
  JUSTIFY: { ar: "علّل ما يأتي:", en: "Give reasons:", hint: "a fact from the book whose reason is stated in the book" },
  DEFINE: { ar: "عرّف ما يأتي:", en: "Define:", hint: "a term defined in the book; answer is the book's definition" },
  COMPARE: { ar: "قارن بين ما يأتي:", en: "Compare:", hint: "two related concepts from the book; answer gives the differences" },
  PROBLEM: { ar: "حلّ المسائل الآتية:", en: "Solve:", hint: "a numeric problem like the book's examples, with NEW numbers; answer shows full working and final result" },
  PROOF: { ar: "أثبت ما يأتي:", en: "Prove:", hint: "a statement provable with the book's theorems; answer is the proof" },
  ESSAY: { ar: "أجب عن الأسئلة الآتية:", en: "Answer the following:", hint: "an open question; answer lists the expected points" },
  APPLIED: { ar: "أجب عن الأسئلة التطبيقية الآتية:", en: "Applied questions:", hint: "apply a concept from the book to a real situation" },
  COMPREHENSION: { ar: "اقرأ ثم أجب:", en: "Read and answer:", hint: "a question about a passage or lesson text in the book" },
  GRAMMAR_PARSING: { ar: "أعرب ما تحته خط:", en: "Parse:", hint: "a sentence (from the book or similar) with the word to parse in [square brackets]; answer is full إعراب" },
  EQUATION_BALANCING: { ar: "اكتب المعادلات الكيميائية الآتية ووازنها:", en: "Write and balance:", hint: "a reaction described in words; answer is the balanced equation" },
};

export const instructionFor = (type: GenType, lang: "AR" | "EN") => (lang === "EN" ? INSTRUCTIONS[type].en : INSTRUCTIONS[type].ar);

export type SourcePage = { pageNumber: number; text: string; isOcr: boolean; asImage: boolean };

/** نص الطلب للنموذج: المنهج، المصدر بأرقام صفحاته، وأقسام الامتحان المطلوبة */
export function buildPrompt(opts: {
  subject: string; grade: string; lang: "AR" | "EN"; difficulty: (typeof DIFFICULTIES)[number]; useLatinSymbols: boolean;
  sections: Section[]; pages: SourcePage[]; avoid?: string[];
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
    `- Difficulty: ${opts.difficulty === "MIXED" ? "a balanced mix of EASY, MEDIUM and HARD" : opts.difficulty}.`,
    opts.useLatinSymbols ? "- Write mathematical expressions with Latin symbols (x, y, a, b) and normal digits, as in Iraqi math books." : "",
    ocrImg.length ? `- Pages ${ocrImg.join(", ")} are attached as IMAGES (their extracted text is unreliable): read their content from the images.` : "",
    ocrText.length ? `- The text of pages ${ocrText.join(", ")} was read by OCR and may contain errors, especially in numbers. Do not copy numbers from these pages unless they are unambiguous.` : "",
    "",
    "SECTIONS TO WRITE (section index, type, number of questions):",
    ...opts.sections.map((s, i) => `  section ${i}: ${s.type} × ${s.count} — ${INSTRUCTIONS[s.type].hint}`),
    opts.avoid?.length ? `\nDo NOT repeat these existing questions:\n${opts.avoid.map((a) => `  - ${a.slice(0, 200)}`).join("\n")}` : "",
    "",
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
  },
  required: ["questions"],
};

export type RawQuestion = { section?: number; prompt?: string; options?: string[]; answer?: string; sourcePages?: number[]; difficulty?: string; cognitiveLevel?: string };
export type CleanQuestion = { prompt: string; options: string[] | null; answer: string; sourcePages: number[]; difficulty: "EASY" | "MEDIUM" | "HARD" | null; cognitiveLevel: (typeof COGNITIVE)[number] | null };

const norm = (s: string) => s.normalize("NFKC").replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/\s+/g, " ").trim().toLowerCase();

/** ينظّف سؤالاً واحداً لنوعه؛ null إن لم يصلح (يُسقط ولا يُحفظ) */
export function cleanQuestion(q: RawQuestion, type: GenType, allowedPages: Set<number>, lang: "AR" | "EN"): CleanQuestion | null {
  const prompt = String(q.prompt ?? "").trim();
  let answer = String(q.answer ?? "").trim();
  if (prompt.length < 3 || prompt.length > 1500 || answer.length < 1 || answer.length > 3000) return null;
  // لا سؤال بلا صفحة مصدر داخل النطاق
  const sourcePages = [...new Set((q.sourcePages ?? []).filter((n) => Number.isInteger(n) && allowedPages.has(n)))].sort((a, b) => a - b);
  if (sourcePages.length === 0) return null;
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
  const difficulty = q.difficulty === "EASY" || q.difficulty === "MEDIUM" || q.difficulty === "HARD" ? q.difficulty : null;
  const cognitiveLevel = (COGNITIVE as readonly string[]).includes(q.cognitiveLevel ?? "") ? (q.cognitiveLevel as CleanQuestion["cognitiveLevel"]) : null;
  return { prompt, options, answer, sourcePages, difficulty, cognitiveLevel };
}

/** يوزّع رد النموذج على الأقسام: تنظيف، إزالة المكرر، والاقتصار على العدد المطلوب */
export function sortIntoSections(raw: RawQuestion[], sections: Section[], allowedPages: Set<number>, lang: "AR" | "EN"): { bySection: CleanQuestion[][]; dropped: number } {
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
