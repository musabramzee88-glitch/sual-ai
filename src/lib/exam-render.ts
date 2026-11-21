/**
 * عارض ورقة الامتحان (دالة نقية تُنتج HTML كاملاً): مصدر واحد لصفحة الطباعة وتصدير PDF.
 * كل نص يُهرَّب (لا HTML من المستخدم أو النموذج)، والمقاطع الرياضية/اللاتينية داخل العربية تُعزل بـ dir="ltr"
 * + unicode-bidi: isolate. القالب يحدد شكل الترويسة والخط والهوامش؛ الحقول تُخفى أو تُعدَّل قيمها.
 */

export type HeaderKey =
  | "republic" | "ministry" | "directorate" | "school" | "title" | "subject" | "grade" | "examKind" | "round" | "yearTerm"
  | "teacher" | "time" | "total" | "model" | "student" | "section" | "date";

export const HEADER_KEYS: HeaderKey[] = ["republic", "ministry", "directorate", "school", "title", "subject", "grade", "examKind", "round", "yearTerm", "teacher", "time", "total", "model", "student", "section", "date"];

/** حقول مخفية افتراضياً (يفعّلها المدرس) */
export const HIDDEN_BY_DEFAULT: HeaderKey[] = ["teacher", "round", "date", "model"];

export const LABELS: Record<"ar" | "en", Record<HeaderKey, string>> = {
  ar: {
    republic: "جمهورية العراق", ministry: "وزارة التربية", directorate: "المديرية العامة للتربية", school: "المدرسة", title: "عنوان الامتحان",
    subject: "المادة", grade: "الصف", examKind: "نوع الامتحان", round: "الدور", yearTerm: "العام الدراسي", teacher: "المدرس",
    time: "الزمن", total: "الدرجة", model: "النموذج", student: "اسم الطالب", section: "الشعبة", date: "التاريخ",
  },
  en: {
    republic: "Republic of Iraq", ministry: "Ministry of Education", directorate: "Directorate of Education", school: "School", title: "Exam title",
    subject: "Subject", grade: "Grade", examKind: "Exam type", round: "Round", yearTerm: "Academic year", teacher: "Teacher",
    time: "Time", total: "Marks", model: "Model", student: "Student name", section: "Section", date: "Date",
  },
};

export const FONTS = ["Traditional Arabic", "Simplified Arabic", "Arial", "Tahoma", "Times New Roman", "Sakkal Majalla", "IBM Plex Sans Arabic", "Noto Naskh Arabic"] as const;
export type Layout = "CLASSIC" | "SCHOOL" | "ACADEMIC" | "MINIMAL";

export type RenderTemplate = {
  layout: Layout;
  pageSize: "A4" | "A3";
  orientation: "PORTRAIT" | "LANDSCAPE";
  fontFamily: string;
  fontSizePt: number;
  lineSpacing: number;
  margins: { top: number; right: number; bottom: number; left: number };
  /** ظهور كل حقل (المفقود = الافتراضي) */
  visible: Partial<Record<HeaderKey, boolean>>;
  /** قيم ثابتة من القالب (اسم المدرسة، المديرية…) */
  values: Partial<Record<HeaderKey, string>>;
  logoDataUri?: string | null;
  /** فراغ للإجابة تحت كل فرع (أسطر) في نسخة الأسئلة */
  answerLines: number;
  footerNote: string | null;
};

export type RenderQuestion = { prompt: string; options: string[] | null; answer: string; marks: number };
export type RenderSection = { instruction: string; marks: number; branches: RenderQuestion[] };
export type RenderExam = {
  lang: "AR" | "EN";
  values: Partial<Record<HeaderKey, string>>;
  /** حقول كتب لها المدرس قيمة لهذا الامتحان: تظهر ولو كانت مخفية في القالب */
  forceShow?: HeaderKey[];
  sections: RenderSection[];
};
export type Variant = "QUESTIONS_ONLY" | "WITH_ANSWERS" | "ANSWER_KEY";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const RUN = /[A-Za-z0-9][A-Za-z0-9\s+\-−×÷=*/^().,√π<>≤≥²³%[\]{}|']*[A-Za-z0-9)²³%\]}|']|[A-Za-z0-9]/g;

/** نص آمن مع عزل المقاطع الرياضية داخل العربية، وأسطر جديدة <br> */
export function richText(text: string): string {
  const arabic = /[؀-ۿ]/.test(text);
  let out = "";
  let last = 0;
  if (arabic) {
    for (const m of text.matchAll(RUN)) {
      const i = m.index ?? 0;
      out += esc(text.slice(last, i)) + `<span class="ltr">${esc(m[0])}</span>`;
      last = i + m[0].length;
    }
  }
  out += esc(text.slice(last));
  return out.replace(/\n/g, "<br>");
}

const digits = (n: number, ar: boolean) => (ar ? n.toLocaleString("ar-EG") : String(n));

/** قيمة حقل: من الامتحان، ثم القالب، وإلا فراغ للكتابة اليدوية */
function field(key: HeaderKey, exam: RenderExam, tpl: RenderTemplate) {
  return (exam.values[key] ?? tpl.values[key] ?? "").trim();
}

function isOn(key: HeaderKey, tpl: RenderTemplate, exam?: RenderExam) {
  if (exam?.forceShow?.includes(key)) return true;
  return tpl.visible[key] ?? !HIDDEN_BY_DEFAULT.includes(key);
}

function line(key: HeaderKey, exam: RenderExam, tpl: RenderTemplate, lang: "ar" | "en", opts: { labelOnly?: boolean; blank?: string } = {}) {
  if (!isOn(key, tpl, exam)) return "";
  const v = field(key, exam, tpl);
  const L = LABELS[lang][key];
  if (key === "republic" || key === "ministry") return `<div class="hl strong">${esc(v || L)}</div>`;
  if (key === "directorate") return v ? `<div class="hl">${esc(v)}</div>` : `<div class="hl">${esc(L)}: ............</div>`;
  if (key === "title") return v ? `<div class="title">${richText(v)}</div>` : "";
  return `<div class="hl"><span class="lbl">${esc(L)}:</span> ${v ? richText(v) : esc(opts.blank ?? "............")}</div>`;
}

function header(exam: RenderExam, tpl: RenderTemplate, variant: Variant, lang: "ar" | "en") {
  const l = (k: HeaderKey, o?: { blank?: string }) => line(k, exam, tpl, lang, o);
  const logo = tpl.logoDataUri ? `<img class="logo" src="${esc(tpl.logoDataUri)}" alt="">` : "";
  const keyTitle = variant === "ANSWER_KEY" ? `<div class="keytitle">${lang === "ar" ? "الإجابات النموذجية" : "Answer key"}</div>` : "";
  const studentRow = variant === "ANSWER_KEY" || (!isOn("student", tpl, exam) && !isOn("section", tpl, exam)) ? "" :
    `<div class="student">${isOn("student", tpl, exam) ? `<span>${esc(LABELS[lang].student)}: ................................................</span>` : "<span></span>"}${isOn("section", tpl, exam) ? `<span>${esc(LABELS[lang].section)}: ........</span>` : ""}</div>`;
  const kindLine = [field("examKind", exam, tpl), isOn("round", tpl, exam) && field("round", exam, tpl) ? `${LABELS[lang].round} ${field("round", exam, tpl)}` : "", isOn("yearTerm", tpl, exam) ? field("yearTerm", exam, tpl) : ""].filter(Boolean).join(" — ");
  const center = `${logo}${l("title")}${isOn("examKind", tpl, exam) && kindLine ? `<div class="hl">${richText(kindLine)}</div>` : ""}${keyTitle}`;
  const right = `${l("republic")}${l("ministry")}${l("directorate")}${l("school")}`;
  const left = `${l("subject")}${l("grade")}${l("time")}${l("total")}${l("teacher")}${l("model")}${l("date", { blank: "   /   /     " })}`;

  if (tpl.layout === "SCHOOL") {
    return `<header class="h-school">${logo}${field("school", exam, tpl) && isOn("school", tpl, exam) ? `<div class="school">${esc(field("school", exam, tpl))}</div>` : ""}<div class="sub">${l("republic")}${l("ministry")}${l("directorate")}</div>${l("title")}${isOn("examKind", tpl, exam) && kindLine ? `<div class="hl">${richText(kindLine)}</div>` : ""}${keyTitle}<div class="grid4">${l("subject")}${l("grade")}${l("time")}${l("total")}${l("teacher")}${l("model")}${l("date", { blank: "   /   /     " })}</div></header>${studentRow}`;
  }
  if (tpl.layout === "ACADEMIC") {
    const cells = (["subject", "grade", "time", "total", "teacher", "model", "date"] as HeaderKey[]).filter((k) => isOn(k, tpl, exam)).map((k) => `<td><span class="lbl">${esc(LABELS[lang][k])}</span><br>${field(k, exam, tpl) ? richText(field(k, exam, tpl)) : "&nbsp;"}</td>`).join("");
    return `<header class="h-academic"><div class="cols"><div>${right}</div><div class="center">${center}</div></div><table class="cells"><tr>${cells}</tr></table></header>${studentRow}`;
  }
  if (tpl.layout === "MINIMAL") {
    const bits = (["subject", "grade", "time", "total"] as HeaderKey[]).filter((k) => isOn(k, tpl, exam) && field(k, exam, tpl)).map((k) => `${esc(LABELS[lang][k])}: ${richText(field(k, exam, tpl))}`);
    return `<header class="h-minimal">${l("title")}${keyTitle}<div class="hl">${bits.join(" &nbsp;|&nbsp; ")}</div></header>${studentRow}`;
  }
  return `<header class="h-classic"><div>${right}</div><div class="center">${center}</div><div class="end">${left}</div></header>${studentRow}`;
}

const LETTERS = { ar: ["أ", "ب", "ج", "د", "هـ", "و"], en: ["a", "b", "c", "d", "e", "f"] };

export function renderExamHtml(exam: RenderExam, tpl: RenderTemplate, variant: Variant, opts: { forPdf?: boolean } = {}): string {
  const lang = exam.lang === "EN" ? "en" : "ar";
  const ar = lang === "ar";
  const n = (x: number) => digits(x, ar);
  const marks = ar ? "درجة" : "marks";
  const body = exam.sections.map((s, i) => {
    const items = s.branches.map((b, j) => {
      const opts = variant !== "ANSWER_KEY" && b.options?.length ? `<div class="opts">${b.options.map((o, k) => `<span>${LETTERS[lang][k]}- ${richText(o)}</span>`).join("")}</div>` : "";
      const ans = variant !== "QUESTIONS_ONLY" ? `<div class="ans">${variant === "WITH_ANSWERS" ? `<span class="lbl">${ar ? "الإجابة" : "Answer"}:</span> ` : ""}${richText(b.answer)}</div>` : "";
      const space = variant === "QUESTIONS_ONLY" && tpl.answerLines > 0 && !b.options?.length ? `<div class="space">${'<div class="rule"></div>'.repeat(tpl.answerLines)}</div>` : "";
      return `<li><div class="item"><span class="num">${ar ? `${n(j + 1)}-` : `${j + 1}.`}</span><div class="txt">${richText(b.prompt)}</div></div>${opts}${ans}${space}</li>`;
    }).join("");
    return `<section><h2><span>${ar ? `س${n(i + 1)}/` : `Q${i + 1}/`} ${richText(s.instruction)}</span><span class="mk">(${n(s.marks)} ${marks})</span></h2><ol>${items}</ol></section>`;
  }).join("");
  const footer = variant === "ANSWER_KEY" || !tpl.footerNote ? "" : `<p class="note">${richText(tpl.footerNote)}</p>`;
  const m = tpl.margins;
  const size = `${tpl.pageSize} ${tpl.orientation === "LANDSCAPE" ? "landscape" : "portrait"}`;
  // PDF: هوامش الصفحة من @page (تتكرر في كل صفحة)؛ طباعة المتصفح: هامش صفر (لا رابط/تاريخ) والهوامش داخل الورقة
  const pageCss = opts.forPdf ? `@page { size: ${size}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; } .sheet { padding: 0; }`
    : `@page { size: ${size}; margin: 0; } .sheet { padding: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`;
  const font = `"${tpl.fontFamily.replace(/"/g, "")}", "Traditional Arabic", "Simplified Arabic", "Noto Naskh Arabic", "IBM Plex Sans Arabic", Tahoma, Arial, sans-serif`;
  return `<!doctype html><html lang="${lang}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>exam</title><style>
${pageCss}
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #000; }
.sheet { font-family: ${font}; font-size: ${tpl.fontSizePt}pt; line-height: ${tpl.lineSpacing}; }
.ltr { direction: ltr; unicode-bidi: isolate; }
.strong { font-weight: 700; }
.lbl { font-weight: 700; }
.hl { line-height: 1.45; }
.logo { max-height: 22mm; max-width: 30mm; display: block; margin: 0 auto 1mm; }
.title { font-weight: 700; font-size: 1.1em; text-align: center; }
.keytitle { font-weight: 700; text-align: center; margin-top: 1mm; }
header { font-size: 0.92em; }
.h-classic { display: grid; grid-template-columns: 1fr 1.1fr 1fr; gap: 3mm; align-items: start; border-bottom: 3px double #000; padding-bottom: 2mm; }
.h-classic .center, .h-academic .center { text-align: center; }
.h-classic .end { text-align: end; }
.h-school { text-align: center; border-bottom: 2px solid #000; padding-bottom: 2mm; }
.h-school .school { font-size: 1.25em; font-weight: 700; }
.h-school .sub { display: flex; justify-content: center; gap: 6mm; flex-wrap: wrap; }
.h-school .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1mm 4mm; margin-top: 1.5mm; text-align: start; }
.h-academic .cols { display: grid; grid-template-columns: 1fr 1.4fr; gap: 3mm; }
.h-academic .cells { width: 100%; border-collapse: collapse; margin-top: 2mm; }
.h-academic .cells td { border: 1px solid #000; padding: 1mm 2mm; text-align: center; vertical-align: top; }
.h-minimal { text-align: center; border-bottom: 1px solid #000; padding-bottom: 1.5mm; }
.student { display: flex; justify-content: space-between; gap: 6mm; border-bottom: 1px solid #000; padding: 1.2mm 0; font-size: 0.92em; }
section { margin-top: 4mm; break-inside: auto; }
h2 { font-size: 1em; font-weight: 700; margin: 0 0 1mm; display: flex; justify-content: space-between; gap: 4mm; break-after: avoid; }
h2 .mk { white-space: nowrap; font-weight: 700; }
ol { list-style: none; margin: 0; padding-inline-start: 5mm; }
li { margin: 0.8mm 0; break-inside: avoid; }
.item { display: flex; gap: 2mm; }
.num { flex: none; }
.txt { flex: 1; }
.opts { display: flex; flex-wrap: wrap; gap: 1mm 10mm; padding-inline-start: 7mm; }
.ans { padding-inline-start: 7mm; font-weight: 700; }
.space { padding-inline-start: 7mm; }
.rule { border-bottom: 1px dotted #777; height: ${(tpl.fontSizePt * tpl.lineSpacing * 1.25).toFixed(1)}pt; }
.note { text-align: center; font-weight: 700; margin-top: 8mm; }
</style></head><body><div class="sheet">${header(exam, tpl, variant, lang)}<main>${body}</main>${footer}</div></body></html>`;
}

export const DEFAULT_TEMPLATE: RenderTemplate = {
  layout: "CLASSIC", pageSize: "A4", orientation: "PORTRAIT", fontFamily: "Traditional Arabic", fontSizePt: 14, lineSpacing: 1.5,
  margins: { top: 12, right: 14, bottom: 12, left: 14 }, visible: {}, values: {}, logoDataUri: null, answerLines: 0,
  footerNote: "مع تمنياتنا لكم بالنجاح والتوفيق",
};
