/**
 * اقتراح فصول كتاب من صفحة «المحتويات» (دوال نقية، بلا DB).
 * - يقرأ أول 14 صفحة بحثاً عن صفحات المحتويات، ويلتقط سطور «عنوان … رقم» أو «رقم … عنوان».
 * - يفضّل المستوى الأعلى (الفصل/الوحدة/الباب) إن وُجد ≥ 2، وإلا يأخذ كل السطور (دروس).
 * - يحدّد فرق الترقيم بين رقم الصفحة المطبوع وترتيبها في الملف بالتحقق من ظهور العنوان في الصفحة المتوقعة.
 *   لا يُعاد اقتراح إلا إذا تحقق ≥ 60% من العناوين (لا تخمين أعمى).
 */
export type TocEntry = { title: string; printed: number };
export type ProposedChapter = { title: string; pageStart: number; pageEnd: number };
export type TocResult = { chapters: ProposedChapter[]; offset: number; verified: number; total: number };

const TASHKEEL = /[ً-ٰٟـۖ-ۭ]/g;
export const flat = (s: string) => s.normalize("NFKC").replace(TASHKEEL, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const LEADER = /[\s.·…_\-–—]+/;
const TOP = /^(?:الفصل|الوحده|الباب|unit|chapter)\b/i;
const TOC_WORD = /المحتويات|المحتوى|فهرس|الفهرست|contents/i;

export function parseTocEntries(pageTexts: string[], pageCount: number): TocEntry[] {
  const entries: TocEntry[] = [];
  const tocPages = pageTexts.flatMap((t, i) => (TOC_WORD.test(flat(t)) ? [i, i + 1] : [])).filter((i, k, a) => a.indexOf(i) === k && i < pageTexts.length);
  for (const i of tocPages) {
    for (const raw of toLatinDigits(pageTexts[i] ?? "").split(/\r?\n/)) {
      const line = raw.replace(TASHKEEL, "").trim();
      if (line.length < 4) continue;
      let m = new RegExp(`^(.*?[\\p{L}].*?)${LEADER.source}(\\d{1,3})$`, "u").exec(line);
      let title = m?.[1], num = m ? Number(m[2]) : NaN;
      if (!m) {
        m = new RegExp(`^(\\d{1,3})${LEADER.source}(.*?[\\p{L}].*)$`, "u").exec(line);
        if (m) { num = Number(m[1]); title = m[2]; }
      }
      if (!title || !Number.isFinite(num) || num < 1 || num > pageCount) continue;
      title = title.replace(/[.·…_]{2,}/g, " ").replace(/\s+/g, " ").replace(/[\s.:·\-–—]+$/g, "").trim();
      if ((title.match(/[ء-يٮ-ۓA-Za-z]/g)?.length ?? 0) < 3 || TOC_WORD.test(flat(title))) continue;
      entries.push({ title, printed: num });
    }
  }
  const top = entries.filter((e) => TOP.test(flat(e.title)));
  const chosen = top.length >= 2 ? top : entries;
  // أرقام صفحات متصاعدة فقط (يُسقط أسطراً عرضية تكسر الترتيب)، دون تكرار
  const out: TocEntry[] = [];
  for (const e of chosen) if (out.length === 0 || e.printed > out[out.length - 1].printed) out.push(e);
  return out;
}

/** يجد أفضل فرق (صفحة الملف − الصفحة المطبوعة) بالتحقق من ظهور بداية العنوان في الصفحة المتوقعة */
export function proposeChapters(pages: { pageNumber: number; text: string }[], pageCount: number): TocResult | null {
  const first = [...pages].sort((a, b) => a.pageNumber - b.pageNumber).filter((p) => p.pageNumber <= 14).map((p) => p.text);
  const entries = parseTocEntries(first, pageCount);
  if (entries.length < 2) return null;
  const byPage = new Map(pages.map((p) => [p.pageNumber, flat(p.text)]));
  const head = (t: string) => flat(t).replace(/^(?:الفصل|الوحده|الباب|الدرس)\s+\S+\s*/, "").replace(/^[:\-\s]+/, "").slice(0, 14);
  let best = { offset: 0, ok: -1 };
  for (let off = 0; off <= 16; off++) {
    let ok = 0;
    for (const e of entries) {
      const p = byPage.get(e.printed + off);
      const h = head(e.title);
      if (p && h.length >= 4 && p.includes(h)) ok++;
    }
    if (ok > best.ok) best = { offset: off, ok };
  }
  if (best.ok < Math.max(2, Math.ceil(entries.length * 0.6))) return null;
  const starts = entries.map((e) => e.printed + best.offset).filter((s) => s <= pageCount);
  const chapters: ProposedChapter[] = entries.slice(0, starts.length).map((e, i) => ({
    title: e.title,
    pageStart: starts[i],
    pageEnd: i + 1 < starts.length ? Math.max(starts[i], starts[i + 1] - 1) : pageCount,
  }));
  return { chapters, offset: best.offset, verified: best.ok, total: entries.length };
}
