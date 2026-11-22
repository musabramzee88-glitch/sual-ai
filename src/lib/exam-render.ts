/**
 * عارض ورقة الامتحان (دالة نقية تُنتج HTML كاملاً): مصدر واحد لصفحة الطباعة وتصدير PDF.
 * كل نص يُهرَّب (لا HTML من المستخدم أو النموذج)، والمقاطع الرياضية/اللاتينية داخل العربية تُعزل بـ dir="ltr"
 * + unicode-bidi: isolate. القالب يحدد شكل الترويسة والخط والهوامش؛ الحقول تُخفى أو تُعدَّل قيمها.
 */

export type HeaderKey =
  | "republic" | "ministry" | "directorate" | "school" | "title" | "subject" | "grade" | "examKind" | "round" | "yearTerm"
  | "teacher" | "time" | "total" | "model" | "student" | "section" | "date" | "examNumber";

export const HEADER_KEYS: HeaderKey[] = ["republic", "ministry", "directorate", "school", "title", "subject", "grade", "examKind", "round", "yearTerm", "teacher", "time", "total", "model", "student", "section", "date", "examNumber"];

/** حقول مخفية افتراضياً (يفعّلها المدرس) */
export const HIDDEN_BY_DEFAULT: HeaderKey[] = ["teacher", "round", "date", "model", "examNumber"];

export const LABELS: Record<"ar" | "en", Record<HeaderKey, string>> = {
  ar: {
    republic: "جمهورية العراق", ministry: "وزارة التربية", directorate: "المديرية العامة للتربية", school: "المدرسة", title: "عنوان الامتحان",
    subject: "المادة", grade: "الصف", examKind: "نوع الامتحان", round: "الدور", yearTerm: "العام الدراسي", teacher: "المدرس",
    time: "الزمن", total: "الدرجة", model: "النموذج", student: "اسم الطالب", section: "الشعبة", date: "التاريخ", examNumber: "الرقم الامتحاني",
  },
  en: {
    republic: "Republic of Iraq", ministry: "Ministry of Education", directorate: "Directorate of Education", school: "School", title: "Exam title",
    subject: "Subject", grade: "Grade", examKind: "Exam type", round: "Round", yearTerm: "Academic year", teacher: "Teacher",
    time: "Time", total: "Marks", model: "Model", student: "Student name", section: "Section", date: "Date", examNumber: "Exam No.",
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
  /** سطر «معلم/ة المادة: ....» أسفل الورقة بجانب عبارة الختام */
  signLine?: boolean;
};

export type RenderQuestion = { prompt: string; options: string[] | null; answer: string; marks: number };
/** answerCount: عدد الفروع التي يجيب عنها الطالب (null = كلها) */
export type RenderSection = { instruction: string; marks: number; answerCount?: number | null; /** نوع السؤال (TRUE_FALSE يظهر في ورقة الإجابة بدائرتي صح/خطأ) */ type?: string | null; branches: RenderQuestion[] };
export type RenderExam = {
  lang: "AR" | "EN";
  values: Partial<Record<HeaderKey, string>>;
  /** حقول كتب لها المدرس قيمة لهذا الامتحان: تظهر ولو كانت مخفية في القالب */
  forceShow?: HeaderKey[];
  /** عدد الأسئلة الرئيسة التي يجيب عنها الطالب (null = كلها) والأول إجباري */
  sectionsToAnswer?: number | null;
  firstRequired?: boolean;
  sections: RenderSection[];
};
export type Variant = "QUESTIONS_ONLY" | "WITH_ANSWERS" | "ANSWER_KEY" | "ANSWER_SHEET";

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
  const keyTitle = variant === "ANSWER_KEY" ? `<div class="keytitle">${lang === "ar" ? "الإجابات النموذجية" : "Answer key"}</div>`
    : variant === "ANSWER_SHEET" ? `<div class="keytitle">${lang === "ar" ? "ورقة الإجابة" : "Answer sheet"}</div>` : "";
  const studentRow = variant === "ANSWER_KEY" || (!isOn("student", tpl, exam) && !isOn("section", tpl, exam)) ? "" :
    `<div class="student">${isOn("student", tpl, exam) ? `<span>${esc(LABELS[lang].student)}: ................................................</span>` : "<span></span>"}${isOn("section", tpl, exam) ? `<span>${esc(LABELS[lang].section)}: ........</span>` : ""}</div>`;
  const kindLine = [field("examKind", exam, tpl), isOn("round", tpl, exam) && field("round", exam, tpl) ? `${LABELS[lang].round} ${field("round", exam, tpl)}` : "", isOn("yearTerm", tpl, exam) ? field("yearTerm", exam, tpl) : ""].filter(Boolean).join("\n");
  const center = `${logo}${l("title")}${isOn("examKind", tpl, exam) && kindLine ? `<div class="hl">${richText(kindLine)}</div>` : ""}${keyTitle}`;
  const right = `${l("republic")}${l("ministry")}${l("directorate")}${l("school")}${l("examNumber")}`;
  const left = `${l("subject")}${l("grade")}${l("time")}${l("total")}${l("teacher")}${l("model")}${l("date", { blank: "   /   /     " })}`;

  if (tpl.layout === "SCHOOL") {
    return `<header class="h-school">${logo}${field("school", exam, tpl) && isOn("school", tpl, exam) ? `<div class="school">${esc(field("school", exam, tpl))}</div>` : ""}<div class="sub">${l("republic")}${l("ministry")}${l("directorate")}</div>${l("title")}${isOn("examKind", tpl, exam) && kindLine ? `<div class="hl">${richText(kindLine)}</div>` : ""}${keyTitle}<div class="grid4">${l("examNumber")}${l("subject")}${l("grade")}${l("time")}${l("total")}${l("teacher")}${l("model")}${l("date", { blank: "   /   /     " })}</div></header>${studentRow}`;
  }
  if (tpl.layout === "ACADEMIC") {
    const cells = (["examNumber", "subject", "grade", "time", "total", "teacher", "model", "date"] as HeaderKey[]).filter((k) => isOn(k, tpl, exam)).map((k) => `<td><span class="lbl">${esc(LABELS[lang][k])}</span><br>${field(k, exam, tpl) ? richText(field(k, exam, tpl)) : "&nbsp;"}</td>`).join("");
    return `<header class="h-academic"><div class="cols"><div>${right}</div><div class="center">${center}</div></div><table class="cells"><tr>${cells}</tr></table></header>${studentRow}`;
  }
  if (tpl.layout === "MINIMAL") {
    const bits = (["subject", "grade", "time", "total"] as HeaderKey[]).filter((k) => isOn(k, tpl, exam) && field(k, exam, tpl)).map((k) => `${esc(LABELS[lang][k])}: ${richText(field(k, exam, tpl))}`);
    return `<header class="h-minimal">${l("title")}${keyTitle}<div class="hl">${bits.join(" &nbsp;|&nbsp; ")}</div></header>${studentRow}`;
  }
  return `<header class="h-classic"><div>${right}</div><div class="center">${center}</div><div class="end">${left}</div></header>${studentRow}`;
}

/** عدّاد عربي سليم: واحد/اثنان/٣–١٠ جمع قلة/١١+ تمييز مفرد منصوب */
function arCount(n: number, one: string, two: string, few: string, many: string, num: (x: number) => string) {
  if (n === 1) return `${one} واحد`;
  if (n === 2) return two;
  return `(${num(n)}) ${n <= 10 ? few : many}`;
}

/** إجابة الاختيار من متعدد تبدأ بحرف الخيار الصحيح («ب- خمسة»)، وغيرها كما هي */
function answerText(b: RenderQuestion, lang: "ar" | "en") {
  const i = b.options?.findIndex((o) => o === b.answer) ?? -1;
  return i >= 0 ? `${LETTERS[lang][i]}- ${richText(b.answer)}` : richText(b.answer);
}

/** ورقة إجابة الطالب: دوائر للأسئلة الموضوعية (اختيار من متعدد، صح/خطأ) مرقّمة «س٢ / ٣» كما في ورقة الأسئلة */
function sheetBody(exam: RenderExam, lang: "ar" | "en", n: (x: number) => string) {
  const ar = lang === "ar";
  const cells: string[] = [];
  exam.sections.forEach((s, i) => {
    s.branches.forEach((b, j) => {
      const choices = b.options?.length ? b.options.map((_, k) => LETTERS[lang][k]) : s.type === "TRUE_FALSE" ? (ar ? ["صح", "خطأ"] : ["True", "False"]) : null;
      if (!choices) return;
      cells.push(`<div class="cell"><span class="no">${ar ? `س${n(i + 1)} / ${n(j + 1)}` : `Q${i + 1} / ${j + 1}`}</span>${choices.map((c) => `<span class="bub"><i></i>${esc(c)}</span>`).join("")}</div>`);
    });
  });
  const lead = `<p class="exnote">${ar ? "ظلّل الدائرة التي تمثّل الإجابة الصحيحة لكل فرع، ودوّن إجابات الأسئلة الأخرى على ورقة الأسئلة." : "Fill in the circle of the correct answer for each item; answer other questions on the question paper."}</p>`;
  return `${lead}${cells.length ? `<div class="cells2">${cells.join("")}</div>` : `<p class="note">${ar ? "لا توجد أسئلة موضوعية في هذا الامتحان." : "This exam has no objective questions."}</p>`}`;
}

/** عبارة ما يتركه الطالب، بأسلوب الأوراق العراقية */
export function pickNotes(exam: RenderExam, lang: "ar" | "en", n: (x: number) => string) {
  const total = exam.sections.length;
  const take = exam.sectionsToAnswer && exam.sectionsToAnswer >= 1 && exam.sectionsToAnswer < total ? exam.sectionsToAnswer : null;
  const examNote = take === null ? "" : lang === "ar"
    ? `ملاحظة: أجب عن ${arCount(take, "سؤال", "سؤالين", "أسئلة", "سؤالاً", n)} فقط من الأسئلة الآتية${exam.firstRequired !== false ? "، والسؤال الأول إجباري" : ""}.`
    : `Note: answer only ${take} of the following ${total} questions${exam.firstRequired !== false ? "; question 1 is compulsory" : ""}.`;
  const sectionNote = (count: number | null | undefined, branches: number) => {
    if (!count || count < 1 || count >= branches) return "";
    return lang === "ar" ? `أجب عن ${arCount(count, "فرع", "فرعين", "فروع", "فرعاً", n)} فقط مما يأتي:` : `Answer only ${count} of the following:`;
  };
  return { examNote, sectionNote };
}

/** أقصى طول (حرفاً) لفرع يُعدّ قصيراً فيُرصّ أفقياً */
const INLINE_MAX = 34;

const LETTERS = { ar: ["أ", "ب", "ج", "د", "هـ", "و"], en: ["a", "b", "c", "d", "e", "f"] };

export function renderExamHtml(exam: RenderExam, tpl: RenderTemplate, variant: Variant, opts: { forPdf?: boolean } = {}): string {
  const lang = exam.lang === "EN" ? "en" : "ar";
  const ar = lang === "ar";
  const n = (x: number) => digits(x, ar);
  const marks = ar ? "درجة" : "marks";
  const notes = pickNotes(exam, lang, n);
  const signLabel = lang === "ar" ? "معلم/ة المادة" : "Subject teacher";
  const sign = tpl.signLine ? `<span>${esc(signLabel)}: ${field("teacher", exam, tpl) ? richText(field("teacher", exam, tpl)) : "................"}</span>` : "";
  const footer = variant === "ANSWER_KEY" || variant === "ANSWER_SHEET" || (!tpl.footerNote && !sign) ? ""
    : sign ? `<div class="note foot"><span>${tpl.footerNote ? richText(tpl.footerNote) : ""}</span>${sign}</div>`
    : `<p class="note">${richText(tpl.footerNote ?? "")}</p>`;
  let footerPlaced = false;
  const body = variant === "ANSWER_SHEET" ? sheetBody(exam, lang, n) : exam.sections.map((s, i) => {
    const rows = s.branches.map((b, j) => {
      const opts = variant !== "ANSWER_KEY" && b.options?.length ? `<div class="opts">${b.options.map((o, k) => `<span>${LETTERS[lang][k]}- ${richText(o)}</span>`).join("")}</div>` : "";
      const ans = variant !== "QUESTIONS_ONLY" ? `<div class="ans">${variant === "WITH_ANSWERS" ? `<span class="lbl">${ar ? "الإجابة" : "Answer"}:</span> ` : ""}${answerText(b, lang)}</div>` : "";
      const space = variant === "QUESTIONS_ONLY" && tpl.answerLines > 0 && !b.options?.length ? `<div class="space">${'<div class="rule"></div>'.repeat(tpl.answerLines)}</div>` : "";
      return `<li><div class="item"><span class="num">${ar ? `${n(j + 1)}-` : `${j + 1}.`}</span><div class="txt">${richText(b.prompt)}</div></div>${opts}${ans}${space}</li>`;
    });
    // فروع قصيرة جداً بلا خيارات ولا فراغ إجابة (تعاريف، مصطلحات): تُرصّ أفقياً بدل سطر لكل فرع
    const inline = variant === "QUESTIONS_ONLY" && tpl.answerLines === 0 && s.branches.length > 1 && s.branches.every((b) => !b.options?.length && b.prompt.length <= INLINE_MAX && !b.prompt.includes("\n"));
    const last = i === exam.sections.length - 1 && footer !== "" && rows.length > 0;
    const cls = inline ? ' class="inline"' : "";
    const head = `<h2><span>${ar ? `س${n(i + 1)}/` : `Q${i + 1}/`} ${richText(s.instruction)}</span><span class="mk">(${n(s.marks)} ${marks})</span></h2>${notes.sectionNote(s.answerCount, s.branches.length) ? `<div class="pick">${esc(notes.sectionNote(s.answerCount, s.branches.length))}</div>` : ""}`;
    if (last) footerPlaced = true;
    // آخر قسم: عبارة الختام تُحبس مع آخر فرع في كتلة لا تنقسم فلا تنفرد بصفحة
    // (المتصفح لا يلتزم دائماً بـ break-before: avoid). القسم الأفقي القصير يُحبس كله معها.
    if (last && inline) return `<div class="tail"><section>${head}<ol${cls}>${rows.join("")}</ol></section>${footer}</div>`;
    if (last) return `<section>${head}${rows.length > 1 ? `<ol>${rows.slice(0, -1).join("")}</ol>` : ""}<div class="tail"><ol>${rows[rows.length - 1]}</ol>${footer}</div></section>`;
    return `<section>${head}<ol${cls}>${rows.join("")}</ol></section>`;
  }).join("");
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
.sheet { font-family: ${font}; font-size: ${tpl.fontSizePt}pt; line-height: ${tpl.lineSpacing}; word-spacing: 0.12em; text-rendering: optimizeLegibility; orphans: 3; widows: 3; }
.ltr { direction: ltr; unicode-bidi: isolate; word-spacing: 0; white-space: nowrap; }
.strong { font-weight: 700; }
.lbl { font-weight: 700; }
.hl { line-height: 1.75; }
.logo { max-height: 22mm; max-width: 30mm; display: block; margin: 0 auto 1.5mm; }
.title { font-weight: 700; font-size: 1.12em; text-align: center; line-height: 1.7; }
.keytitle { font-weight: 700; text-align: center; margin-top: 1.5mm; }
header { font-size: 0.92em; }
.h-classic { display: grid; grid-template-columns: 1fr 1.1fr 1fr; gap: 4mm; align-items: start; border-bottom: 3px double #000; padding-bottom: 3.5mm; }
.h-classic .center, .h-academic .center { text-align: center; }
.h-classic .end { text-align: end; }
.h-school { text-align: center; border-bottom: 2px solid #000; padding-bottom: 3.5mm; }
.h-school .school { font-size: 1.25em; font-weight: 700; line-height: 1.7; }
.h-school .sub { display: flex; justify-content: center; gap: 2em; flex-wrap: wrap; }
.h-school .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.2em 1.2em; margin-top: 2.5mm; text-align: start; }
.h-academic .cols { display: grid; grid-template-columns: 1fr 1.4fr; gap: 4mm; }
.h-academic .cells { width: 100%; border-collapse: collapse; margin-top: 3mm; }
.h-academic .cells td { border: 1px solid #000; padding: 1.8mm 2.5mm; text-align: center; vertical-align: top; line-height: 1.6; }
.h-minimal { text-align: center; border-bottom: 1px solid #000; padding-bottom: 2.5mm; }
.student { display: flex; justify-content: space-between; gap: 6mm; border-bottom: 1px solid #000; margin-top: 3mm; padding: 0 0 2.5mm; font-size: 0.92em; }
main { margin-top: 1.2em; }
section { margin-top: 1.6em; break-inside: auto; }
section:first-child { margin-top: 0; }
h2 { font-size: 1em; font-weight: 700; margin: 0 0 0.6em; display: flex; justify-content: space-between; align-items: baseline; gap: 1.2em; line-height: 1.6; break-after: avoid; }
h2 .mk { white-space: nowrap; font-weight: 700; }
ol { list-style: none; margin: 0; padding: 0; }
li { margin: 0 0 0.75em; break-inside: avoid; }
li:last-child { margin-bottom: 0; }
.item { display: flex; gap: 0.5em; }
.num { flex: none; min-width: 1.9em; font-weight: 700; }
.txt { flex: 1; }
.opts { display: flex; flex-wrap: wrap; gap: 0.35em 2.6em; margin-top: 0.4em; padding-inline-start: 2.4em; }
.opts span { break-inside: avoid; }
.ans { margin-top: 0.35em; padding-inline-start: 2.4em; font-weight: 700; }
.space { margin-top: 0.35em; padding-inline-start: 2.4em; }
.rule { border-bottom: 1px dotted #777; height: 2em; }
.exnote { margin: 1.1em 0 0; font-weight: 700; text-align: center; border: 1px solid #000; padding: 1.5mm 3mm; line-height: 1.7; }
.pick { font-weight: 700; margin: -0.2em 0 0.6em; font-size: 0.95em; }
.note { text-align: center; font-weight: 700; margin: 2em 0 0; break-before: avoid; break-inside: avoid; }
.tail { break-inside: avoid; }
.cells2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.9em 2.5em; margin-top: 1.4em; }
.cell { display: flex; align-items: center; gap: 0.9em; break-inside: avoid; border-bottom: 1px dotted #999; padding-bottom: 0.5em; }
.cell .no { min-width: 4.6em; font-weight: 700; }
.bub { display: inline-flex; align-items: center; gap: 0.3em; }
.bub i { display: inline-block; width: 1.15em; height: 1.15em; border: 1.5px solid #000; border-radius: 50%; }
.tail > .note { margin-top: 1.6em; }
.foot { display: flex; justify-content: space-between; align-items: baseline; gap: 2em; text-align: start; }
ol.inline { display: flex; flex-wrap: wrap; gap: 0.45em 2.6em; }
ol.inline li { margin: 0; }
</style></head><body><div class="sheet">${header(exam, tpl, variant, lang)}<main>${notes.examNote && variant !== "ANSWER_SHEET" ? `<p class="exnote">${esc(notes.examNote)}</p>` : ""}${body}${footerPlaced ? "" : footer}</main></div></body></html>`;
}

export const DEFAULT_TEMPLATE: RenderTemplate = {
  layout: "CLASSIC", pageSize: "A4", orientation: "PORTRAIT", fontFamily: "Traditional Arabic", fontSizePt: 14, lineSpacing: 1.65,
  margins: { top: 12, right: 14, bottom: 12, left: 14 }, visible: {}, values: {}, logoDataUri: null, answerLines: 0,
  footerNote: "مع تمنياتنا لكم بالنجاح والتوفيق",
};
