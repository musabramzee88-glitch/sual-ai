/**
 * اقتراح فصول كتاب من صفحة «المحتويات» (دوال نقية، بلا DB).
 * - صفحات المحتويات تُبحث في أول 14 صفحة وآخر 10 (الكتب العراقية تضعها غالباً في آخر الكتاب).
 * - الطريقة الأولى: سطور «عنوان … رقم» ثم فرق الترقيم (صفحة الملف − المطبوعة) بالتحقق من ظهور العناوين.
 * - الطريقة الثانية (حين تفسد OCR الأرقام، كالأرقام الهندية المقروءة حروفاً لاتينية): يُبحث عن كل عنوان
 *   بالتتابع في صفحات الكتاب، ويُعتمد موضع ظهوره.
 * - المستوى: إن وُجدت ≥ 4 وحدات/فصول/أبواب تؤخذ وحدها؛ وإلا تؤخذ كل البنود (الوحدات مع دروسها).
 * - لا يُقترح شيء إلا إذا تحقق ≥ 60% من العناوين، وإذا لم تكن أغلب البنود صفحة واحدة (فهرس فقرات لا فصول).
 */
/** level: 1 وحدة/فصل/باب، 2 درس (يأتي من قراءة الصور؛ من النص يُستنتج بالكلمات) */
export type TocEntry = { title: string; printed: number | null; level?: 1 | 2 };
export type ProposedChapter = { title: string; pageStart: number; pageEnd: number };
export type TocResult = { chapters: ProposedChapter[]; offset: number | null; verified: number; total: number; method: "numbers" | "titles" | "footer" | "printed" };

const TASHKEEL = /[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g;
export const flat = (s: string) => s.normalize("NFKC").replace(TASHKEEL, "").replace(/[أإآٱ]/g, "ا").replace(/اال/g, "الا") /* لام-ألف مفكوكة بترتيب العرض: «األولى»→«الأولى» */.replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const LEADER = /[\s.·…_\-–—]+/;
// \b لا يعمل مع الحروف العربية في JS: الحدّ مسافة أو نقطتان أو رقم أو نهاية
const TOP = /^(?:الفصل|الوحده|الباب|unit|chapter)(?=[\s:\d/]|$)/i;
const TOC_WORD = /المحتويات|محتويات|المحتوى|فهرس|الفهرست|contents/i;
const SKIP = /^(?:المقدمه|مقدمه|الموضوع|رقم الصفحه|(?:ت )?الموضوع.*الصفحه.*|(?:اسئله|تمارين|اختبار) (?:الفصل|الوحده).*|الاختبار القبلي|تمرينات الفصول|الفصولتمرينات|معجم .*|(?:محتويات الكتاب|المحتويات|الفهرس|فهرس الكتاب|المصادر|المراجع)|contents|introduction|glossary|word list)$/i;
/** بند ليس فصلاً (مقدمة، فهرس، اختبار، معجم…) */
export const isSkippableTitle = (t: string) => SKIP.test(flat(t).replace(/[().:،,-]+$/g, "").trim());
const AR_WORD = /[\u0621-\u064A]{2,}/g;

/** عنوان نظيف: بلا ترقيم أو رموز OCR في أوله وآخره، ولا أرقام صفحات ملتصقة به */
function cleanTitle(t: string): string {
  return t
    .replace(/^[\d\s.\-–—·•*=:;,؛،"'()[\]|]+/, "")
    .replace(/[.·…_]{2,}/g, " ")
    .replace(/\s+\d{1,3}$/, "")
    .replace(/(?:\s+[A-Za-z]{1,3})+$/, "") // ضجيج OCR لاتيني في آخر السطر (أرقام هندية مقروءة حروفاً)
    .replace(/[\s.:·\-–—=+|]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** نسخة عربية فقط من سطر OCR (تُسقط الحروف اللاتينية والأرقام والرموز الدخيلة) */
const arabicOnly = (line: string) => (line.normalize("NFKC").replace(TASHKEEL, "").match(AR_WORD) ?? []).join(" ");

export function parseTocEntries(pageTexts: string[], pageCount: number): TocEntry[] {
  const entries: TocEntry[] = [];
  // الصفحة التالية لصفحة المحتويات تُعدّ تكملة لها فقط إن كانت بشكل فهرس (≥ 3 سطور تنتهي/تبدأ برقم)
  const looksToc = (t: string) => toLatinDigits(t).split(/\r?\n/).filter((l) => /\p{L}.*\s\d{1,3}\s*$|^\s*\d{1,3}\s*[-.–—]\s*\p{L}/u.test(l)).length >= 3;
  const tocPages = pageTexts.flatMap((t, i) => (TOC_WORD.test(flat(t)) ? [i, ...(i + 1 < pageTexts.length && looksToc(pageTexts[i + 1]) ? [i + 1] : [])] : [])).filter((i, k, a) => a.indexOf(i) === k);
  for (const i of tocPages) {
    for (const raw of toLatinDigits(pageTexts[i] ?? "").split(/\r?\n/)) {
      const line = raw.replace(TASHKEEL, "").trim();
      if (line.length < 4 || TOC_WORD.test(flat(line))) continue;
      let m = new RegExp(`^(.*?[\\p{L}].*?)${LEADER.source}(\\d{1,3})$`, "u").exec(line);
      let title = m?.[1] ?? null, num: number | null = m ? Number(m[2]) : null;
      if (!m) {
        m = new RegExp(`^(\\d{1,3})${LEADER.source}(.*?[\\p{L}].*)$`, "u").exec(line);
        if (m) { num = Number(m[1]); title = m[2]; }
      }
      if (num !== null && (num < 1 || num > pageCount)) num = null;
      // بلا رقم مقروء: يُحتفظ بالعنوان العربي فقط (الطريقة الثانية تبحث عنه في الصفحات)
      title = cleanTitle(title ?? line);
      if (num === null) title = arabicOnly(title);
      // عنوان عربي فيه شظايا لاتينية قصيرة من OCR: تُحذف مع الرموز الشاردة (لا يمس عناوين الكتب الإنكليزية)
      else if ((flat(title).match(AR_WORD)?.length ?? 0) >= 2) {
        title = title.replace(/(?<![A-Za-z])[A-Za-z]{1,4}(?![A-Za-z])/g, " ").replace(/[_"“”«»—–]+/g, " ").replace(/\(\s*\)|\)\s*\(/g, " ");
        title = cleanTitle(title);
      }
      const words = flat(title).match(AR_WORD)?.length ?? 0;
      const latin = title.match(/[A-Za-z]{3,}/g)?.length ?? 0;
      if (SKIP.test(flat(title))) continue;
      // كلمة واحدة تُقبل برقم صفحة مقروء فقط (عنوان مثل «الدجاج»)؛ بلا رقم تلزم كلمتان على الأقل
      const single = words === 1 && num !== null && (flat(title).match(AR_WORD)?.[0].length ?? 0) >= 4;
      if (words < 1 || (words < 2 && !single && !TOP.test(flat(title))) || latin > words) continue;
      entries.push({ title, printed: num });
    }
  }
  return entries;
}

/** المستوى المعتمد: الوحدات/الفصول وحدها إن كانت ≥ 4، وإلا كل البنود */
function chooseLevel(entries: TocEntry[]): TocEntry[] {
  const top = entries.some((e) => e.level) ? entries.filter((e) => e.level === 1) : entries.filter((e) => TOP.test(flat(e.title)));
  return top.length >= 4 ? top : entries;
}

const GENERIC = /^(?:الفصل|الوحده|الباب|الدرس|الجزء|الاول|الاولي|الثاني|الثانيه|الثالث|الثالثه|الرابع|الرابعه|الخامس|الخامسه|السادس|السادسه|السابع|السابعه|الثامن|الثامنه|التاسع|التاسعه|العاشر|العاشره|الحادي|الحاديه|عشر|عشره)$/;

/** أول 4 سطور غير فارغة من الصفحة (مطبّعة) */
const headLines = (raw: string) => raw.split(/\r?\n/).map(flat).filter((l) => l.length > 0).slice(0, 4);

/** العنوان ظاهر في الصفحة: بدايته حرفياً، أو معظم كلماته (تسامح مع OCR) */
type Page = { raw: string; flat: string };
function titleOn(page: Page, title: string): boolean {
  const pageFlat = page.flat;
  const f = flat(title);
  const head = f.replace(/^(?:الفصل|الوحده|الباب|الدرس)\s+\S+\s*/, "").replace(/^[:\-\s]+/, "").slice(0, 14);
  if (head.length >= 5 && pageFlat.includes(head)) return true;
  const words = (f.match(AR_WORD) ?? []).filter((w) => w.length >= 3 && !GENERIC.test(w)).slice(0, 6);
  // عنوان عام بلا اسم («الوحدة الأولى»): يُقبل فقط في رأس الصفحة (لا إشارة عابرة إليه في نص آخر)
  if (words.length === 0) return f.length >= 6 && headLines(page.raw).some((l) => l.startsWith(f) && l.length <= f.length + 25);
  if (words.length === 1) return words[0].length >= 5 && pageFlat.includes(words[0]);
  return words.filter((w) => pageFlat.includes(w)).length >= Math.max(2, Math.ceil(words.length * 0.7));
}

function toChapters(entries: TocEntry[], starts: number[], pageCount: number): ProposedChapter[] {
  return entries.map((e, i) => ({
    title: e.title,
    pageStart: starts[i],
    pageEnd: i + 1 < starts.length ? Math.max(starts[i], starts[i + 1] - 1) : pageCount,
  }));
}

/** فهرس فقرات لا فصول: أغلب البنود صفحة واحدة */
const tooFine = (ch: ProposedChapter[]) => ch.filter((c) => c.pageEnd === c.pageStart).length > ch.length * 0.5;

/**
 * فهرس ناقص: أول فصل يبدأ بعد ثلث الكتاب، أو آخر فصل يبتلع ما بقي من الكتاب (صفحة فهرس ثانية لم تُقرأ):
 * آخر فصل أطول من 30% من الكتاب وأطول من ثلاثة أضعاف وسيط الفصول.
 */
const partial = (ch: ProposedChapter[], pageCount: number) => {
  if (ch.length === 0) return false;
  if (ch[0].pageStart > pageCount * 0.3) return true;
  const lens = ch.map((c) => c.pageEnd - c.pageStart + 1);
  const median = [...lens].sort((a, b) => a - b)[Math.floor(lens.length / 2)];
  const last = lens[lens.length - 1];
  return ch.length >= 3 && last > pageCount * 0.3 && last > median * 3;
};

/**
 * فرق الترقيم من أرقام الصفحات المطبوعة في رأس/ذيل الصفحات نفسها (دليل مستقل عن العناوين).
 * يعيد أفضل فرق ونسبة الصفحات المؤيِّدة له من عيّنة.
 */
export function footerOffset(pages: Map<number, Page>, pageCount: number): { offset: number; support: number } {
  const sample: number[] = [];
  for (let n = 8; n <= pageCount - 2; n += Math.max(1, Math.floor(pageCount / 40))) sample.push(n);
  let best = { offset: 0, support: 0 };
  for (let off = 0; off <= 16; off++) {
    let ok = 0;
    for (const n of sample) {
      const raw = pages.get(n)?.raw;
      if (!raw) continue;
      const lines = toLatinDigits(raw).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const edge = [...lines.slice(0, 2), ...lines.slice(-2)];
      if (edge.some((l) => new RegExp(`(?:^|\\D)${n - off}(?:\\D|$)`).test(l) && l.length <= 12)) ok++;
    }
    const support = sample.length ? ok / sample.length : 0;
    if (support > best.support) best = { offset: off, support };
  }
  return best;
}

/**
 * يحوّل بنود فهرس (من النص أو من قراءة الصور) إلى فصول متحقَّق من صفحاتها.
 * trusted: البنود من قراءة صور الفهرس (عناوين وأرقام نظيفة)؛ يُقبل حينها فرق الترقيم المؤيَّد بأرقام ذيل الصفحات
 * حين تعجز مطابقة العناوين (نص OCR مشوَّه).
 */
export function chaptersFromEntries(pages: { pageNumber: number; text: string }[], pageCount: number, all: TocEntry[], opts: { tocPages?: Set<number>; trusted?: boolean; knownOffset?: number | null } = {}): TocResult | null {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const tocPageNumbers = opts.tocPages ?? new Set<number>();
  const byPage = new Map<number, Page>(sorted.map((p) => [p.pageNumber, { raw: p.text, flat: flat(p.text) }]));

  // الطريقة الأولى: أرقام الصفحات + فرق ترقيم متحقَّق منه
  const numbered = chooseLevel(all.filter((e) => e.printed !== null));
  const mono: TocEntry[] = [];
  for (const e of numbered) if (mono.length === 0 || e.printed! > mono[mono.length - 1].printed!) mono.push(e);
  if (mono.length >= 3) {
    let best = { offset: 0, ok: -1 };
    for (let off = 0; off <= 16; off++) {
      let ok = 0;
      for (const e of mono) { const p = byPage.get(e.printed! + off); if (p && titleOn(p, e.title)) ok++; }
      if (ok > best.ok) best = { offset: off, ok };
    }
    const build = (offset: number) => {
      const kept = mono.filter((e) => e.printed! + offset <= pageCount);
      return toChapters(kept, kept.map((e) => e.printed! + offset), pageCount);
    };
    // فرق الترقيم من أرقام الصفحات التي قرأها النموذج في الصور نفسها (دليل مباشر)
    if (opts.trusted && opts.knownOffset != null && opts.knownOffset >= 0 && opts.knownOffset <= 16) {
      const ch = build(opts.knownOffset);
      if (!tooFine(ch) && !partial(ch, pageCount)) return { chapters: ch, offset: opts.knownOffset, verified: best.ok, total: mono.length, method: "printed" };
    }
    // البنود من صور الفهرس أنظف من نص OCR للصفحات: يكفي تأييد أقل (35%، وعنوانان على الأقل)
    const need = opts.trusted ? Math.max(2, Math.ceil(mono.length * 0.35)) : Math.ceil(mono.length * 0.6);
    if (best.ok >= need) {
      const ch = build(best.offset);
      if (!tooFine(ch) && !partial(ch, pageCount)) return { chapters: ch, offset: best.offset, verified: best.ok, total: mono.length, method: "numbers" };
    }
    if (opts.trusted) {
      const f = footerOffset(byPage, pageCount);
      if (f.support >= 0.4) {
        const ch = build(f.offset);
        if (!tooFine(ch) && !partial(ch, pageCount)) return { chapters: ch, offset: f.offset, verified: Math.round(f.support * 100), total: 100, method: "footer" };
      }
    }
  }

  // الطريقة الثانية: البحث عن كل عنوان بالتتابع (الأرقام غير مقروءة)
  const titled = chooseLevel(all);
  if (titled.length < 3) return null;
  const firstContent = Math.min(...[...tocPageNumbers].filter((n) => n <= 14).map((n) => n + 1), 3);
  const found: { e: TocEntry; page: number }[] = [];
  let cursor = Math.max(2, firstContent);
  for (const e of titled) {
    for (let p = cursor; p <= pageCount; p++) {
      if (tocPageNumbers.has(p)) continue;
      const t = byPage.get(p);
      if (t && titleOn(t, e.title)) { found.push({ e, page: p }); cursor = p + 1; break; }
    }
  }
  // البحث بالعناوين أضعف من الأرقام: يلزم العثور على 80% منها
  if (found.length < 3 || found.length < Math.ceil(titled.length * 0.8)) return null;
  const ch = toChapters(found.map((f) => f.e), found.map((f) => f.page), pageCount);
  // بالبحث وحده: وحدة من صفحة واحدة بين وحدات قليلة من المستوى نفسه = مطابقة خاطئة غالباً
  const sameLevel = new Set(found.map((f) => f.e.level ?? (TOP.test(flat(f.e.title)) ? 1 : 2))).size === 1;
  if (sameLevel && ch.length <= 8 && ch.some((c) => c.pageEnd === c.pageStart)) return null;
  if (tooFine(ch) || partial(ch, pageCount)) return null;
  return { chapters: ch, offset: null, verified: found.length, total: titled.length, method: "titles" };
}

/** صفحات المحتويات المرشّحة (أول 14 وآخر 10) بحسب كلمة «المحتويات/فهرس» في نصها */
export function tocCandidatePages(pages: { pageNumber: number; text: string }[], pageCount: number): number[] {
  return pages.filter((p) => (p.pageNumber <= 14 || p.pageNumber > pageCount - 10) && TOC_WORD.test(flat(p.text))).map((p) => p.pageNumber).sort((a, b) => a - b);
}

export function proposeChapters(pages: { pageNumber: number; text: string }[], pageCount: number): TocResult | null {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const scan = sorted.filter((p) => p.pageNumber <= 14 || p.pageNumber > pageCount - 10);
  const all = parseTocEntries(scan.map((p) => p.text), pageCount);
  return chaptersFromEntries(sorted, pageCount, all, { tocPages: new Set(tocCandidatePages(sorted, pageCount)) });
}
