/**
 * فحص سلامة الكتب (دوال نقية: بلا قاعدة بيانات ولا ملفات، فتُختبر بسهولة ويستعملها السكربت والواجهة).
 * كل فحص يُنتج مشكلة بشدّة: error (لا تعتمد على الكتاب قبل إصلاحها) · warn (راجع) · info (للعلم).
 */
import { createHash } from "node:crypto";
import { arabicWordScore, isGarbageText, reverseVisual, singleLetterShare } from "./text";

export type Severity = "error" | "warn" | "info";
export type Issue = { code: string; severity: Severity; detail?: string };

export type BookCheckInput = {
  id: string;
  name: string;
  status: string;
  error: string | null;
  stale: boolean; // PROCESSING بلا نبض حياة
  sizeBytes: number;
  fileSizeOnDisk: number | null; // null = الملف غير موجود
  pageCount: number | null;
  textPageCount: number | null;
  confirmed: boolean;
  pages: { pageNumber: number; text: string; isOcr: boolean }[];
  detected: { gradeCode: string | null; subjectCode: string | null; kind: string; part?: number; confidence: string } | null;
  curriculum: {
    id: string; title: string; gradeCode: string; subjectCode: string; kind: string; part: number;
    chapters: { title: string; pageStart: number | null; pageEnd: number | null }[];
    booksCount: number;
  } | null;
};

export type BookReport = { id: string; name: string; level: "ok" | "warn" | "error"; issues: Issue[]; stats: { pages: number; textPages: number; ocrPages: number; blankPages: number } };
export type Report = { generatedAt: string; books: BookReport[]; summary: { total: number; ok: number; warn: number; error: number } };

const ARABIC = /[؀-ۿ]/g;
const LATIN = /[A-Za-z]/g;
const count = (s: string, rx: RegExp) => s.match(rx)?.length ?? 0;
const letters = (s: string) => count(s, /\p{L}/gu);

/** نسبة الحروف العربية المفردة المفصولة بمسافات («ا ل ر ي ا ض ي ا ت»): علامة استخراج حرفاً حرفاً. التشكيل المنفصل لا يُحتسب. */
export const letterSpacedRatio = singleLetterShare;

/** مجموع نقاط الكلمات الشائعة بالترتيب الحالي مقابل المعكوس (تراكمي على سطور النص) */
export function orderScores(text: string): { normal: number; reversed: number } {
  let normal = 0, reversed = 0;
  for (const line of text.split("\n")) {
    if (!ARABIC.test(line)) { ARABIC.lastIndex = 0; continue; }
    ARABIC.lastIndex = 0;
    normal += arabicWordScore(line);
    reversed += arabicWordScore(reverseVisual(line));
  }
  return { normal, reversed };
}

/** متوسط طول «الكلمات» العربية: قيمة كبيرة جداً تعني أن المسافات ضاعت */
export function avgArabicTokenLength(text: string): number {
  const toks = text.split(/\s+/).filter((t) => (t.match(ARABIC)?.length ?? 0) >= 2);
  if (toks.length < 30) return 0;
  return toks.reduce((n, t) => n + [...t].length, 0) / toks.length;
}

const GARBAGE = /[�-\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * طبيعة U+FFFD (حرف لم يُفهم): داخل كلمات عربية (حروف ضائعة ⇒ نص فاسد) أم منفردة (أيقونات ⇒ غالباً بلا ضرر)،
 * مع مقتطفين من سياقها لتشخيص العيّنة بالعين.
 */
export function fffdNature(text: string): { inside: number; alone: number; samples: string[] } {
  let inside = 0, alone = 0;
  const samples: string[] = [];
  for (const m of text.matchAll(/\uFFFD/g)) {
    const i = m.index!;
    const near = text.slice(Math.max(0, i - 1), i) + text.slice(i + 1, i + 2);
    if (/[\u0600-\u06FFA-Za-z0-9]/.test(near)) inside++; else alone++;
    if (samples.length < 2 && /[\u0600-\u06FF]/.test(text.slice(Math.max(0, i - 12), i + 12))) samples.push(text.slice(Math.max(0, i - 12), i + 13).replace(/\n/g, "↵"));
  }
  return { inside, alone, samples };
}

/** أكثر الرموز التالفة تكراراً (U+XXXX×n) لتمييز رموز الأيقونات/النقاط (PUA) من التلف الحقيقي */
export function topGarbage(text: string, n = 3): string {
  const m = new Map<string, number>();
  for (const ch of text.match(GARBAGE) ?? []) {
    const k = ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `U+${k}×${c}`).join(" ");
}

const EXPECT_LATIN = new Set(["ENGLISH", "FRENCH"]);

export function checkBook(b: BookCheckInput): BookReport {
  const issues: Issue[] = [];
  const add = (code: string, severity: Severity, detail?: string) => issues.push({ code, severity, detail });

  // ── الملف والحالة ──
  if (b.fileSizeOnDisk === null) add("FILE_MISSING", "error");
  else if (b.fileSizeOnDisk !== b.sizeBytes) add("FILE_SIZE_MISMATCH", "error", `${b.fileSizeOnDisk} ≠ ${b.sizeBytes}`);
  if (b.stale) add("STUCK", "error");
  else if (b.status === "PROCESSING" || b.status === "UPLOADED") add("STILL_PROCESSING", "info");
  if (b.status === "FAILED") add(b.error ? `FAILED_${b.error}` : "FAILED", "error");
  if (b.status === "READY" && b.error === "PARTIAL_TEXT") add("PARTIAL_TEXT", "warn");

  const pages = b.pages;
  const pageCount = b.pageCount ?? pages.length;
  const textPages = pages.filter((p) => letters(p.text) >= 10);
  const ocrPages = pages.filter((p) => p.isOcr);
  const blank = pages.filter((p) => letters(p.text) < 10);
  // العدّ من قاعدة البيانات إن توفر (يصح مع عيّنة الصفحات)؛ وإلا من الصفحات المعروضة
  const blankTotal = b.textPageCount != null && pageCount > 0 ? Math.max(0, pageCount - b.textPageCount) : blank.length;
  if (pageCount > 0 && pageCount < 4) add("TOO_FEW_PAGES", "warn", String(pageCount));
  if (pageCount > 600) add("TOO_MANY_PAGES", "warn", String(pageCount));
  if (ocrPages.length > 0) add("OCR_USED", "warn", `${ocrPages.length}/${pageCount}`);
  if (b.status === "READY" && ocrPages.length === 0 && pageCount >= 10 && blankTotal / pageCount > 0.3) add("MANY_BLANK_PAGES", "warn", `${blankTotal}/${pageCount}`);

  // ── جودة النص (على الصفحات ذات النص الأصلي، لا OCR فالـOCR له تنبيهه) ──
  const native = textPages.filter((p) => !p.isOcr);
  if (native.length > 0) {
    const all = native.map((p) => p.text).join("\n");
    const { normal, reversed } = orderScores(all);
    if (reversed >= 8 && reversed > normal * 1.5) add("REVERSED_TEXT", "error", `${reversed}/${normal}`);
    // صفحات طبقة نصها غير موثوقة (حروف مستبدلة بلاتيني/رموز أو FFFD داخل الكلمات): تحتاج OCR
    const bad = native.filter((p) => isGarbageText(p.text));
    if (bad.length > 0) add("UNRELIABLE_TEXT_LAYER", bad.length / native.length > 0.3 ? "error" : "warn", `${bad.length}/${native.length} صفحة`);
    const spaced = letterSpacedRatio(all);
    if (spaced > 0.35) add("LETTER_SPACED_TEXT", "error", spaced.toFixed(2));
    if (avgArabicTokenLength(all) > 14) add("MISSING_SPACES", "warn");
    const garbage = count(all, GARBAGE);
    if (garbage / Math.max(1, all.length) > 0.002) {
      const f = fffdNature(all);
      add("GARBAGE_CHARS", "warn", `${topGarbage(all)}${f.inside + f.alone > 0 ? ` · FFFD داخل كلمات ${f.inside} / منفردة ${f.alone}${f.samples.length ? ` · «${f.samples.join("» «")}»` : ""}` : ""}`);
    }
    const ar = count(all, ARABIC), la = count(all, LATIN);
    const subject = b.curriculum?.subjectCode ?? b.detected?.subjectCode ?? null;
    if (subject && ar + la > 200) {
      const latinShare = la / (ar + la);
      if (EXPECT_LATIN.has(subject) && latinShare < 0.5) add("LANGUAGE_MISMATCH", "warn", `${subject}: ${(latinShare * 100).toFixed(0)}% لاتيني`);
      if (!EXPECT_LATIN.has(subject) && latinShare > 0.7) add("LANGUAGE_MISMATCH", "warn", `${subject}: ${(latinShare * 100).toFixed(0)}% لاتيني`);
    }
  }

  // ── مطابقة المنهج والغلاف ──
  const c = b.curriculum;
  if (!c) add("NOT_LINKED", "warn");
  else {
    if (!b.confirmed) add("NOT_CONFIRMED", "info");
    const d = b.detected;
    if (d && d.confidence === "high") {
      const diffs: string[] = [];
      if (d.gradeCode && d.gradeCode !== c.gradeCode) diffs.push(`الصف: الغلاف ${d.gradeCode} ≠ المنهج ${c.gradeCode}`);
      if (d.subjectCode && d.subjectCode !== c.subjectCode) diffs.push(`المادة: الغلاف ${d.subjectCode} ≠ المنهج ${c.subjectCode}`);
      if (d.kind !== "TEXTBOOK" && d.kind !== c.kind) diffs.push(`النوع: الغلاف ${d.kind} ≠ المنهج ${c.kind}`);
      if ((d.part ?? 0) !== c.part && (d.part ?? 0) > 0) diffs.push(`الجزء: الغلاف ${d.part} ≠ المنهج ${c.part}`);
      if (diffs.length) add("COVER_MISMATCH", "warn", diffs.join(" · "));
    }
    if (c.booksCount > 1) add("SHARED_CURRICULUM", "error", String(c.booksCount));
    if (b.confirmed && c.chapters.length === 0) add("NO_CHAPTERS", "info");
    // أرقام فصول مقابل صفحات الكتاب (الفصول تخص منهجاً بكتاب واحد)
    if (c.booksCount === 1) {
      const bad = c.chapters.filter((ch) => ch.pageEnd != null && pageCount > 0 && ch.pageEnd > pageCount);
      if (bad.length) add("CHAPTER_PAGE_OUT_OF_RANGE", "error", bad.map((x) => `${x.title}: ${x.pageEnd} > ${pageCount}`).join(" · "));
      const ranged = c.chapters.filter((ch) => ch.pageStart != null && ch.pageEnd != null);
      for (let i = 1; i < ranged.length; i++) {
        if (ranged[i].pageStart! < ranged[i - 1].pageEnd! ) { add("CHAPTER_PAGES_OVERLAP", "warn", `${ranged[i - 1].title} / ${ranged[i].title}`); break; }
      }
    }
  }
  if (!c && b.detected && b.detected.confidence === "low") add("LOW_CONFIDENCE", "info");

  const level = issues.some((i) => i.severity === "error") ? "error" : issues.some((i) => i.severity === "warn") ? "warn" : "ok";
  return { id: b.id, name: b.name, level, issues, stats: { pages: pageCount, textPages: textPages.length, ocrPages: ocrPages.length, blankPages: blankTotal } };
}

/** بصمة أول صفحات الكتاب النصية (لكشف كتابين بالمحتوى نفسه رُفعا بملفين مختلفين) */
export function contentFingerprint(pages: { pageNumber: number; text: string }[]): string | null {
  const t = pages.filter((p) => p.pageNumber <= 6).map((p) => p.text).join("\n").replace(/\s+/g, "");
  return letters(t) < 200 ? null : createHash("sha256").update(t).digest("hex");
}

export function buildReport(inputs: BookCheckInput[], now = new Date()): Report {
  const books = inputs.map((i) => checkBook(i));
  // تكرار المحتوى بين كتب مختلفة
  const groups = new Map<string, string[]>();
  for (const i of inputs) {
    const f = contentFingerprint(i.pages);
    if (f) groups.set(f, [...(groups.get(f) ?? []), i.id]);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const r = books.find((b) => b.id === id)!;
      r.issues.push({ code: "DUPLICATE_CONTENT", severity: "warn", detail: ids.filter((x) => x !== id).map((x) => inputs.find((i) => i.id === x)!.name).join("، ") });
      if (r.level === "ok") r.level = "warn";
    }
  }
  const order = { error: 0, warn: 1, ok: 2 } as const;
  books.sort((a, b) => order[a.level] - order[b.level] || a.name.localeCompare(b.name));
  return {
    generatedAt: now.toISOString(),
    books,
    summary: { total: books.length, ok: books.filter((b) => b.level === "ok").length, warn: books.filter((b) => b.level === "warn").length, error: books.filter((b) => b.level === "error").length },
  };
}

const MESSAGES: Record<string, string> = {
  HASH_MISMATCH: "بصمة الملف (SHA-256) تغيّرت: الملف تالف أو عُدّل بعد الرفع", PDF_UNREADABLE: "تعذّر فتح ملف PDF", PAGECOUNT_MISMATCH: "عدد الصفحات الفعلي في الملف يختلف عن المسجَّل",
  STORED_TEXT_DRIFT: "النص المخزَّن يختلف عن نص الملف الحالي: أعد معالجة الكتاب",
  FILE_MISSING: "ملف الكتاب غير موجود على القرص", FILE_SIZE_MISMATCH: "حجم الملف على القرص يختلف عن المسجَّل (تالف أو معدَّل)", STUCK: "عالق في المعالجة بلا نبض",
  STILL_PROCESSING: "ما زال قيد المعالجة", PARTIAL_TEXT: "نص جزئي: كثير من الصفحات بلا نص", TOO_FEW_PAGES: "عدد صفحاته قليل جداً", TOO_MANY_PAGES: "عدد صفحاته كبير جداً",
  OCR_USED: "بعض صفحاته مقروءة بـ OCR (قد تحوي أخطاء، خصوصاً الأرقام)", MANY_BLANK_PAGES: "أكثر من 30% من الصفحات بلا نص (رسوم؟ أم فشل استخراج؟)",
  REVERSED_TEXT: "العربية مقلوبة (حروف الكلمات بترتيب معكوس)", LETTER_SPACED_TEXT: "العربية مستخرجة حرفاً حرفاً (طبقة النص في الـPDF معطوبة): أعد معالجة الكتاب ليُقرأ بـ OCR", MISSING_SPACES: "المسافات بين الكلمات ضائعة",
  UNRELIABLE_TEXT_LAYER: "طبقة النص في بعض الصفحات غير موثوقة (حروف عربية مستبدلة برموز أو ضائعة): أعد معالجة الكتاب لتُقرأ تلك الصفحات بـ OCR",
  GARBAGE_CHARS: "رموز تالفة في النص", LANGUAGE_MISMATCH: "لغة النص لا تطابق المادة (غالباً طبقة نص معطوبة: أعد معالجة الكتاب)", NOT_LINKED: "غير مربوط بمنهج", NOT_CONFIRMED: "ينتظر تأكيدك", LOW_CONFIDENCE: "التعرّف على غلافه غير مؤكد",
  COVER_MISMATCH: "ما يقوله الغلاف يختلف عن المنهج المربوط به", SHARED_CURRICULUM: "أكثر من كتاب في المنهج نفسه (تتعارض أرقام الصفحات والفصول؛ افصلها بالجزء أو النوع)",
  NO_CHAPTERS: "منهجه بلا فصول (تُدخل قبل معالج الامتحان)", CHAPTER_PAGE_OUT_OF_RANGE: "فصل يتجاوز عدد صفحات الكتاب", CHAPTER_PAGES_OVERLAP: "صفحات فصلين متداخلة",
  DUPLICATE_CONTENT: "محتواه يطابق كتاباً آخر", FAILED: "فشلت المعالجة", FAILED_NEEDS_OCR: "لم يُستخرج منه نص (مصوَّر ولم يُقرأ بـ OCR)", FAILED_CANCELLED: "أُوقفت معالجته", FAILED_EXTRACT_FAILED: "تعذّر قراءة الملف (تالف؟)",
};
export const issueMessage = (code: string) => MESSAGES[code] ?? code;

/** تقرير نصي مختصر يمكن نسخه وإرساله (لا يحوي أسراراً: أسماء الملفات والأعداد فقط) */
export function formatReport(r: Report): string {
  const icon = { error: "✗", warn: "!", ok: "✓" } as const;
  const noCh = r.books.filter((b) => b.issues.some((i) => i.code === "NO_CHAPTERS")).length;
  const lines = [`فحص الكتب — ${r.generatedAt}`, `الإجمالي ${r.summary.total}: سليم ${r.summary.ok} · تنبيه ${r.summary.warn} · خطأ ${r.summary.error}`, ...(noCh ? [`كتب منهجها بلا فصول (مهمة قادمة، ليست خطأ): ${noCh}`] : []), ""];
  for (const b of r.books) {
    lines.push(`${icon[b.level]} ${b.name}  [${b.stats.pages} ص، نص ${b.stats.textPages}، OCR ${b.stats.ocrPages}]`);
    for (const i of b.issues.filter((x) => x.severity !== "info")) lines.push(`    ${i.severity === "error" ? "خطأ" : "تنبيه"}: ${issueMessage(i.code)}${i.detail ? ` (${i.detail})` : ""}`);
  }
  return lines.join("\n");
}

const summarize = (books: BookReport[]) => ({ total: books.length, ok: books.filter((b) => b.level === "ok").length, warn: books.filter((b) => b.level === "warn").length, error: books.filter((b) => b.level === "error").length });

/** يضيف مشكلات (من فحص عميق مثلاً) إلى كتاب في تقرير قائم ويعيد حساب مستواه وملخص التقرير وترتيبه */
export function addIssues(r: Report, bookId: string, issues: Issue[]): void {
  const b = r.books.find((x) => x.id === bookId);
  if (!b || issues.length === 0) return;
  b.issues.push(...issues);
  b.level = b.issues.some((i) => i.severity === "error") ? "error" : b.issues.some((i) => i.severity === "warn") ? "warn" : "ok";
  const order = { error: 0, warn: 1, ok: 2 } as const;
  r.books.sort((a, c) => order[a.level] - order[c.level] || a.name.localeCompare(c.name));
  r.summary = summarize(r.books);
}
