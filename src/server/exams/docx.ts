import "server-only";
import {
  AlignmentType, BorderStyle, Document, Footer, ImageRun, PageNumber, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
  type ParagraphChild,
} from "docx";
import { mathTokens } from "@/lib/math-format";
import {
  LABELS, LETTERS, answerPlain, digits, field, isInlineSection, isOn, keepTogether, pickNotes, splitRuns, tableCells, tableStyleOf,
  type HeaderKey, type RenderExam, type RenderQuestion, type RenderTemplate, type Variant,
} from "@/lib/exam-render";

/**
 * ملف Word (DOCX) للورقة: المحتوى والترتيب نفسهما في الطباعة وPDF (نفس العناوين الجانبية والترقيم العراقي وملاحظات
 * الأسئلة الاختيارية والنماذج وورقة الإجابة)، بنص عربي من اليمين لليسار قابل للتحرير في Word.
 * لا مكتبة تحويل HTML: يُبنى من RenderExam مباشرة، فيبقى مطابقاً للعارض الأصلي ولا يتأثر بتنسيقاته.
 */
const TW = 56.6929; // تويب لكل مليمتر
const mm = (x: number) => Math.round(x * TW);
const PAGE = { A4: { w: 11906, h: 16838 }, A3: { w: 16838, h: 23811 } } as const;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER } as const;
const LINE = { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 } as const;

type Style = { bold?: boolean; color?: string; size?: number };

/** عرض الصورة والجدول: أبعاد PNG/JPEG من رأس الملف (بكسل) أو null */
export function imageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

export type DocxOptions = { pageNumbers: boolean };

export async function renderExamDocx(exam: RenderExam, tpl: RenderTemplate, variant: Variant, opts: DocxOptions = { pageNumbers: true }): Promise<Buffer> {
  const lang = exam.lang === "EN" ? "en" : "ar";
  const ar = lang === "ar";
  const n = (x: number) => digits(x, ar);
  const font = tpl.fontFamily;
  const sizeHalf = Math.round(tpl.fontSizePt * 2);
  const accent = tpl.accent && /^#[0-9a-fA-F]{6}$/.test(tpl.accent) ? tpl.accent.slice(1).toUpperCase() : "000000";
  const lineTw = Math.round(tpl.lineSpacing * 240);
  const gapK = tpl.gap && tpl.gap > 0 ? tpl.gap : 1; // تقليص المسافات في الملاءمة التلقائية
  const m = tpl.margins;
  const base = PAGE[tpl.pageSize];
  const landscape = tpl.orientation === "LANDSCAPE";
  const contentW = (landscape ? base.h : base.w) - mm(m.left) - mm(m.right);
  const contentPx = Math.round((contentW / 1440) * 96);

  /** أجزاء نص: العربي من اليمين، واللاتيني/الرياضي مقطع مستقل */
  const runs = (text: string, st: Style = {}): ParagraphChild[] => {
    const out: ParagraphChild[] = [];
    text.split("\n").forEach((line, li) => {
      if (li > 0) out.push(new TextRun({ break: 1 }));
      for (const seg of splitRuns(line.length ? line : "")) {
        // مقاطع لاتينية/رياضية: أس ودليل ورموز صحيحة؛ العربي كما هو. النص اللاتيني الخالص (امتحان إنكليزي) يُنسَّق كنثر.
        const toks = seg.ltr || !ar ? mathTokens(seg.text, { prose: !ar }) : [{ t: "text" as const, s: seg.text }];
        // LRM حول المقطع الرياضي وسط العربية: يمنع Word من قلب ≤ ≥ ( ) وعكس ترتيب «x = -2»
        if (seg.ltr && ar && toks.length) { toks[0] = { ...toks[0], s: `\u200E${toks[0].s}` }; toks[toks.length - 1] = { ...toks[toks.length - 1], s: `${toks[toks.length - 1].s}\u200E` }; }
        for (const tk of toks) {
          out.push(new TextRun({
            text: tk.s, rightToLeft: ar && !seg.ltr, bold: st.bold, boldComplexScript: st.bold, color: st.color,
            superScript: tk.t === "sup" || undefined, subScript: tk.t === "sub" || undefined,
            font: { ascii: font, hAnsi: font, cs: font, eastAsia: font }, size: st.size ?? sizeHalf, sizeComplexScript: st.size ?? sizeHalf,
          }));
        }
      }
    });
    return out;
  };
  const para = (text: string | ParagraphChild[], o: { st?: Style; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; start?: number; hanging?: number; keepNext?: boolean; border?: boolean } = {}) =>
    new Paragraph({
      bidirectional: ar, alignment: o.align, keepNext: o.keepNext, keepLines: true,
      spacing: { line: lineTw, before: Math.round((o.before ?? 0) * gapK), after: Math.round((o.after ?? 0) * gapK) },
      indent: o.start !== undefined ? { start: o.start, hanging: o.hanging } : undefined,
      border: o.border ? { bottom: LINE } : undefined,
      children: typeof text === "string" ? runs(text, o.st) : text,
    });
  const cell = (children: Paragraph[], width: number, extra: { fill?: string; borders?: boolean } = {}) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA }, children: children.length ? children : [para("")],
      borders: extra.borders ? undefined : NO_BORDERS, shading: extra.fill ? { type: ShadingType.CLEAR, fill: extra.fill, color: "auto" } : undefined,
    });
  const table = (rows: TableRow[], width = contentW) => new Table({ rows, width: { size: width, type: WidthType.DXA }, visuallyRightToLeft: ar, borders: { ...NO_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER } });

  // ── الترويسة ──
  const labelled = (k: HeaderKey, blank = "............"): Paragraph | null => {
    if (!isOn(k, tpl, exam)) return null;
    const v = field(k, exam, tpl);
    const L = LABELS[lang][k];
    if (k === "republic" || k === "ministry") return para(v || L, { st: { bold: true } });
    if (k === "directorate") return para(v ? v : `${L}: ${blank}`);
    return para([...runs(`${L}: `, { bold: true }), ...runs(v || blank)]);
  };
  const compact = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);
  const kindLine = [field("examKind", exam, tpl), isOn("round", tpl, exam) && field("round", exam, tpl) ? `${LABELS[lang].round} ${field("round", exam, tpl)}` : "", isOn("yearTerm", tpl, exam) ? field("yearTerm", exam, tpl) : ""].filter(Boolean);
  const keyTitle = variant === "ANSWER_KEY" ? (ar ? "الإجابات النموذجية" : "Answer key") : variant === "ANSWER_SHEET" ? (ar ? "ورقة الإجابة" : "Answer sheet") : "";
  const titleParas = compact([
    isOn("title", tpl, exam) && field("title", exam, tpl) ? para(field("title", exam, tpl), { st: { bold: true, color: accent, size: sizeHalf + 2 }, align: AlignmentType.CENTER }) : null,
    ...(isOn("examKind", tpl, exam) ? kindLine.map((l) => para(l, { align: AlignmentType.CENTER })) : []),
    keyTitle ? para(keyTitle, { st: { bold: true, color: accent }, align: AlignmentType.CENTER }) : null,
  ]);
  const rightP = compact(["republic", "ministry", "directorate", "school", "examNumber"].map((k) => labelled(k as HeaderKey)));
  const leftP = compact((["subject", "grade", "time", "total", "teacher", "model"] as HeaderKey[]).map((k) => labelled(k)).concat([labelled("date", "   /   /     ")]));
  const headerBlock: (Paragraph | Table)[] = [];
  if (tpl.layout === "MINIMAL") {
    headerBlock.push(...titleParas);
    const bits = (["subject", "grade", "time", "total"] as HeaderKey[]).filter((k) => isOn(k, tpl, exam) && field(k, exam, tpl)).map((k) => `${LABELS[lang][k]}: ${field(k, exam, tpl)}`);
    if (bits.length) headerBlock.push(para(bits.join("   |   "), { align: AlignmentType.CENTER }));
  } else if (tpl.layout === "ACADEMIC") {
    headerBlock.push(table([new TableRow({ children: [cell(rightP, Math.round(contentW * 0.5)), cell(titleParas, Math.round(contentW * 0.5))] })]));
    const keys = (["examNumber", "subject", "grade", "time", "total", "teacher", "model", "date"] as HeaderKey[]).filter((k) => isOn(k, tpl, exam));
    if (keys.length) {
      const w = Math.floor(contentW / keys.length);
      headerBlock.push(new Table({
        visuallyRightToLeft: ar, width: { size: contentW, type: WidthType.DXA },
        rows: [new TableRow({ children: keys.map((k) => cell([para(LABELS[lang][k], { st: { bold: true }, align: AlignmentType.CENTER }), para(field(k, exam, tpl) || " ", { align: AlignmentType.CENTER })], w, { borders: true })) })],
      }));
    }
  } else if (tpl.layout === "SCHOOL") {
    if (isOn("school", tpl, exam) && field("school", exam, tpl)) headerBlock.push(para(field("school", exam, tpl), { st: { bold: true, color: accent, size: sizeHalf + 4 }, align: AlignmentType.CENTER }));
    headerBlock.push(para(compact(["republic", "ministry", "directorate"].map((k) => (isOn(k as HeaderKey, tpl, exam) ? field(k as HeaderKey, exam, tpl) || LABELS[lang][k as HeaderKey] : null))).join("   "), { align: AlignmentType.CENTER }));
    headerBlock.push(...titleParas);
    const meta = compact((["examNumber", "subject", "grade", "time", "total", "teacher", "model"] as HeaderKey[]).map((k) => (isOn(k, tpl, exam) ? `${LABELS[lang][k]}: ${field(k, exam, tpl) || "........"}` : null)));
    if (meta.length) headerBlock.push(para(meta.join("   "), { align: AlignmentType.CENTER }));
  } else {
    const w3 = Math.floor(contentW / 3);
    headerBlock.push(table([new TableRow({ children: [cell(rightP, w3), cell(titleParas, contentW - 2 * w3), cell(leftP, w3)] })]));
  }
  headerBlock.push(new Paragraph({ border: { bottom: { style: BorderStyle.DOUBLE, size: 6, color: accent, space: 6 } }, spacing: { after: 120 }, children: [] }));
  if (variant !== "ANSWER_KEY" && (isOn("student", tpl, exam) || isOn("section", tpl, exam))) {
    headerBlock.push(table([new TableRow({ children: [
      cell([para(isOn("student", tpl, exam) ? `${LABELS[lang].student}: ................................................` : "")], Math.round(contentW * 0.7)),
      cell([para(isOn("section", tpl, exam) ? `${LABELS[lang].section}: ........` : "", { align: AlignmentType.END })], contentW - Math.round(contentW * 0.7)),
    ] })]));
    headerBlock.push(new Paragraph({ border: { bottom: LINE }, spacing: { after: 160 }, children: [] }));
  }

  // ── الأسئلة ──
  const notes = pickNotes(exam, lang, n);
  const body: (Paragraph | Table)[] = [];
  if (notes.examNote && variant !== "ANSWER_SHEET") body.push(para(notes.examNote, { st: { bold: true }, align: AlignmentType.CENTER, after: 160, border: false }));

  const mediaParas = (b: RenderQuestion): (Paragraph | Table)[] => {
    if (variant === "ANSWER_KEY" || variant === "ANSWER_SHEET") return [];
    const out: (Paragraph | Table)[] = [];
    const dm = b.image ? /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(b.image) : null;
    if (dm) {
      const buf = Buffer.from(dm[2], "base64");
      const dim = imageSize(buf);
      if (dim && dim.w > 0 && dim.h > 0) {
        const k = Math.min(1, (contentPx * 0.6) / dim.w, 227 / dim.h);
        out.push(new Paragraph({
          bidirectional: ar, spacing: { before: 60, after: 60 }, indent: { start: 567 },
          children: [new ImageRun({ type: dm[1] === "png" ? "png" : "jpg", data: buf, transformation: { width: Math.round(dim.w * k), height: Math.round(dim.h * k) }, altText: { title: "", description: "", name: "" } })],
        }));
      }
    }
    if (b.table?.cells.length) {
      const cols = b.table.cells[0].length;
      const grid = tableStyleOf(b.table) === "GRID";
      const w = Math.floor((contentW - 567) / cols);
      out.push(new Table({
        visuallyRightToLeft: ar, width: { size: w * cols, type: WidthType.DXA }, indent: { size: 567, type: WidthType.DXA },
        // الشكلان بلا إطار: يُلغى إطار الجدول نفسه أيضاً (الافتراضي خطوط مفردة) وليس خلاياه فقط
        borders: grid ? undefined : { ...NO_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
        rows: tableCells(b.table).map((r, i) => new TableRow({
          height: { value: grid ? 440 : 360, rule: "atLeast" },
          children: r.map((c) => cell([para(c, { st: { bold: b.table!.header && i === 0 }, align: grid ? AlignmentType.CENTER : AlignmentType.START })], w, { borders: grid, fill: grid && b.table!.header && i === 0 ? "EEEEEE" : undefined })),
        })),
      }));
      out.push(para("", { after: 40 }));
    }
    return out;
  };

  if (variant === "ANSWER_SHEET") {
    body.push(para(ar ? "ظلّل الدائرة التي تمثّل الإجابة الصحيحة لكل فرع، ودوّن إجابات الأسئلة الأخرى على ورقة الأسئلة." : "Fill in the circle of the correct answer for each item; answer other questions on the question paper.", { st: { bold: true }, align: AlignmentType.CENTER, after: 200 }));
    const items: string[] = [];
    exam.sections.forEach((s, i) => s.branches.forEach((b, j) => {
      const choices = b.options?.length ? b.options.map((_, k) => LETTERS[lang][k]) : s.type === "TRUE_FALSE" ? (ar ? ["صح", "خطأ"] : ["True", "False"]) : null;
      if (choices) items.push(`${ar ? `س${n(i + 1)} / ${n(j + 1)}` : `Q${i + 1} / ${j + 1}`}      ${choices.map((c) => `○ ${c}`).join("     ")}`);
    }));
    if (!items.length) body.push(para(ar ? "لا توجد أسئلة موضوعية في هذا الامتحان." : "This exam has no objective questions.", { align: AlignmentType.CENTER }));
    const half = Math.floor(contentW / 2);
    for (let i = 0; i < items.length; i += 2) body.push(table([new TableRow({ children: [cell([para(items[i], { after: 120 })], half), cell([para(items[i + 1] ?? "", { after: 120 })], contentW - half)] })]));
  } else {
    exam.sections.forEach((s, i) => {
      const hw = contentW - mm(32);
      body.push(table([new TableRow({ children: [
        cell([para(`${ar ? `س${n(i + 1)}/` : `Q${i + 1}/`} ${s.instruction}`, { st: { bold: true, color: accent }, before: 200, keepNext: true })], hw),
        cell([para(`(${n(s.marks)} ${ar ? "درجة" : "marks"})`, { st: { bold: true, color: accent }, align: AlignmentType.END, before: 200, keepNext: true })], contentW - hw),
      ] })]));
      const pick = notes.sectionNote(s.answerCount, s.branches.length);
      if (pick) body.push(para(pick, { st: { bold: true }, keepNext: true, after: 60 }));
      if (s.passage && (variant === "QUESTIONS_ONLY" || variant === "WITH_ANSWERS")) {
        // القطعة الخارجية في إطار بخلية واحدة، وفقرات النص كما كتبها
        body.push(table([new TableRow({ children: [cell(s.passage.split(/\n{2,}/).map((t) => para(t, { align: AlignmentType.JUSTIFIED, after: 80 })), contentW, { borders: true })] })]));
        body.push(para("", { after: 60 }));
      }
      if (isInlineSection(s, variant, tpl.answerLines)) {
        body.push(para(s.branches.map((b, j) => `${ar ? `${n(j + 1)}-` : `${j + 1}.`} ${b.prompt}`).join("          "), { start: 0, after: 80 }));
        return;
      }
      // أجزاء السؤال بالترتيب؛ السؤال المحفوظ كاملاً (keepTogether) يربط كل جزء بالتالي (keepNext) إلا الأخير فيبقى في صفحة واحدة
      const keep = tpl.keepSections !== false && keepTogether(s, variant, tpl.answerLines);
      const parts: { base: boolean; make: (kn: boolean) => Paragraph | Table }[] = [];
      s.branches.forEach((b, j) => {
        const last = i === exam.sections.length - 1 && j === s.branches.length - 1;
        parts.push({ base: !!(b.options?.length || b.image || b.table) || variant !== "QUESTIONS_ONLY" || last, make: (kn) => para(`${ar ? `${n(j + 1)}-` : `${j + 1}.`}\t${b.prompt}`, { start: 567, hanging: 567, before: 60, keepNext: kn }) });
        for (const m of mediaParas(b)) parts.push({ base: true, make: () => m });
        if (variant !== "ANSWER_KEY" && b.options?.length) parts.push({ base: false, make: (kn) => para(b.options!.map((o, k) => `${LETTERS[lang][k]}- ${o}`).join("      "), { start: 567, after: 40, keepNext: kn }) });
        if (variant !== "QUESTIONS_ONLY") parts.push({ base: false, make: (kn) => para([...(variant === "WITH_ANSWERS" ? runs(`${ar ? "الإجابة" : "Answer"}: `, { bold: true }) : []), ...runs(answerPlain(b, lang), { bold: true })], { start: 567, after: 40, keepNext: kn }) });
        if (variant === "QUESTIONS_ONLY" && tpl.answerLines > 0 && !b.options?.length) for (let k = 0; k < tpl.answerLines; k++) parts.push({ base: false, make: (kn) => new Paragraph({ keepNext: kn, border: { bottom: { style: BorderStyle.DOTTED, size: 4, color: "777777", space: 1 } }, spacing: { before: 200 }, indent: { start: 567 }, children: [] }) });
      });
      parts.forEach((pt, idx) => body.push(pt.make(pt.base || (keep && idx < parts.length - 1))));
    });
  }

  // ── الختام والتوقيع ──
  const showFoot = variant !== "ANSWER_KEY" && variant !== "ANSWER_SHEET";
  const sign = tpl.signLine ? `${ar ? "معلم/ة المادة" : "Subject teacher"}: ${field("teacher", exam, tpl) || "................"}` : "";
  if (showFoot && (tpl.footerNote || sign)) {
    const half = Math.floor(contentW / 2);
    body.push(sign
      ? table([new TableRow({ children: [cell([para(tpl.footerNote ?? "", { st: { bold: true }, before: 320 })], half), cell([para(sign, { st: { bold: true }, align: AlignmentType.END, before: 320 })], contentW - half)] })])
      : para(tpl.footerNote ?? "", { st: { bold: true }, align: AlignmentType.CENTER, before: 320 }));
  }

  const footer = opts.pageNumbers
    ? new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: ar, children: [
      new TextRun({ text: `${ar ? "صفحة" : "Page"} `, size: 18, rightToLeft: ar }), new TextRun({ children: [PageNumber.CURRENT], size: 18 }), new TextRun({ text: " / ", size: 18 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 }),
    ] })] })
    : undefined;

  const doc = new Document({
    creator: "سُؤال AI", title: field("title", exam, tpl) || "exam",
    styles: { default: { document: { run: { font: { ascii: font, hAnsi: font, cs: font, eastAsia: font }, size: sizeHalf, sizeComplexScript: sizeHalf } } } },
    sections: [{
      properties: { page: { size: { width: base.w, height: base.h, orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: mm(m.top), bottom: mm(m.bottom), left: mm(m.left), right: mm(m.right), footer: mm(6) } } },
      footers: footer ? { default: footer } : undefined,
      children: [...headerBlock, ...body],
    }],
  });
  return Packer.toBuffer(doc);
}
