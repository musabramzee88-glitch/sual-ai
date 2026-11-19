/**
 * تنظيف نص مستخرج من PDF عربي (دوال نقية قابلة للاختبار).
 * - NFKC يحوّل أشكال العرض العربية (ﻻ ﺍ ﺑ…) إلى الحروف الأصلية.
 * - بعض ملفات PDF تخزّن العربية بالترتيب المرئي (مقلوبة). نكتشف ذلك بكلمات شائعة
 *   ونقلب السطر فقط عند رجحان واضح، مع إعادة الأرقام واللاتيني لترتيبها.
 */
const COMMON = new Set([
  "في", "من", "على", "إلى", "الى", "عن", "أن", "ان", "ما", "لا", "هو", "هي", "التي", "الذي", "مع", "كل", "هذا", "هذه",
  "كان", "بين", "او", "أو", "ثم", "قد", "لم", "لن", "إذا", "اذا", "عند", "بعد", "قبل", "حتى", "الدرس", "الفصل", "تمرين", "مثال", "اكتب", "أكتب", "اجب", "أجب",
]);
const ARABIC = /[؀-ۿ]/;
const words = (s: string) => s.split(/[\s،,.:؛;!?؟()«»"'\-]+/).filter(Boolean);
export const arabicWordScore = (s: string) => {
  let n = 0;
  for (const w of words(s)) if (COMMON.has(w) || (w.length > 3 && w.startsWith("ال"))) n++;
  return n;
};

/** يقلب الأحرف ثم يعيد تسلسلات الأرقام/اللاتيني إلى ترتيبها الطبيعي */
export function reverseVisual(line: string): string {
  const rev = [...line].reverse().join("");
  const run = "[A-Za-z0-9٠-٩.,%+\\-=/×÷^()[\\]]";
  // مقاطع لاتينية/رقمية (وعبارات لاتينية متعددة الكلمات) تعود لترتيبها الطبيعي
  return rev.replace(new RegExp(`${run}{2,}(?: ${run}+)*`, "g"), (m) => [...m].reverse().join(""));
}

export function fixArabicLine(line: string): string {
  if (!ARABIC.test(line)) return line;
  const normal = arabicWordScore(line);
  const reversed = arabicWordScore(reverseVisual(line));
  return reversed >= normal + 2 || (normal === 0 && reversed >= 1) ? reverseVisual(line) : line;
}

/**
 * رموز خط Symbol/Wingdings تأتي من PDF في المنطقة الخاصة U+F0xx (الرمز = F000 + رمز الخط).
 * F020 هي المسافة، وبعضها رموز رياضية نحافظ عليها؛ وباقيها أيقونات/نقاط تزيين تُحذف.
 */
const SYMBOL_FONT: Record<string, string> = {
  "\uF020": " ", "\uF0B1": "±", "\uF0B4": "×", "\uF0B8": "÷", "\uF0A3": "≤", "\uF0B3": "≥", "\uF0B9": "≠", "\uF0BB": "≈",
  "\uF0D6": "√", "\uF070": "π", "\uF0A5": "∞", "\uF0D0": "∠", "\uF0B0": "°", "\uF0AE": "→", "\uF0AC": "←",
};
const cleanSymbolFont = (t: string) => t.replace(/[\uF000-\uF0FF]/g, (c) => SYMBOL_FONT[c] ?? "");

export function cleanPageText(raw: string): string {
  return cleanSymbolFont(raw)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") // محارف تحكم/NUL (خطوط بلا ToUnicode)
    .normalize("NFKC")
    .replace(/ـ/g, "") // تطويل
    .replace(/[​-‏‪-‮⁦-⁩]/g, "") // محارف اتجاه/صفرية العرض
    .split("\n")
    .map((l) => fixArabicLine(l.replace(/[ \t]+/g, " ").trim()))
    .filter((l) => l.length > 0)
    .join("\n");
}

/** هل في الصفحة نص حقيقي؟ (المصوّرة تعطي فراغاً أو رموزاً متناثرة) */
export const hasRealText = (t: string) => (t.match(/[\p{L}]/gu)?.length ?? 0) >= 40;

// ───────────── تجميع النص حسب موقعه في الصفحة ─────────────
// أشكال العرض العربية (من بيانات Unicode): «شكل نهاية» في أول الكلمة أو «شكل بداية» في آخرها
// يعني أن الكلمة مخزّنة مقلوبة (ترتيب مرئي). مولَّدة من unicodedata — لا تُعدَّل يدوياً.
const FINAL_FORMS = /^[\uFB51\uFB53\uFB57\uFB5B\uFB5F\uFB63\uFB67\uFB6B\uFB6F\uFB73\uFB77\uFB7B\uFB7F\uFB83\uFB85\uFB87\uFB89\uFB8B\uFB8D\uFB8F\uFB93\uFB97\uFB9B\uFB9F\uFBA1\uFBA5\uFBA7\uFBAB\uFBAF\uFBB1\uFBD4\uFBD8\uFBDA\uFBDC\uFBDF\uFBE1\uFBE3\uFBE5\uFBEB\uFBED\uFBEF\uFBF1\uFBF3\uFBF5\uFBF7\uFBFA\uFBFD\uFC64-\uFC96\uFD11-\uFD2C\uFD3C\uFD51\uFD58\uFD5A-\uFD5B\uFD5E-\uFD5F\uFD62\uFD64\uFD66-\uFD67\uFD69-\uFD6A\uFD6C\uFD6E-\uFD6F\uFD71\uFD74-\uFD76\uFD78-\uFD7C\uFD7E-\uFD82\uFD84-\uFD85\uFD87\uFD8B\uFD96-\uFD97\uFD99-\uFD9C\uFD9E-\uFDB3\uFDB6-\uFDB7\uFDB9\uFDBB-\uFDC2\uFDC6-\uFDC7\uFE82\uFE84\uFE86\uFE88\uFE8A\uFE8E\uFE90\uFE94\uFE96\uFE9A\uFE9E\uFEA2\uFEA6\uFEAA\uFEAC\uFEAE\uFEB0\uFEB2\uFEB6\uFEBA\uFEBE\uFEC2\uFEC6\uFECA\uFECE\uFED2\uFED6\uFEDA\uFEDE\uFEE2\uFEE6\uFEEA\uFEEE\uFEF0\uFEF2\uFEF6\uFEF8\uFEFA\uFEFC]$/;
const INITIAL_FORMS = /^[\uFB54\uFB58\uFB5C\uFB60\uFB64\uFB68\uFB6C\uFB70\uFB74\uFB78\uFB7C\uFB80\uFB90\uFB94\uFB98\uFB9C\uFBA2\uFBA8\uFBAC\uFBD5\uFBE6\uFBE8\uFBF8\uFBFB\uFBFE\uFC97-\uFCDE\uFD2D-\uFD33\uFD50\uFD52-\uFD57\uFD59\uFD5C-\uFD5D\uFD60-\uFD61\uFD63\uFD65\uFD68\uFD6B\uFD6D\uFD70\uFD72-\uFD73\uFD77\uFD7D\uFD83\uFD86\uFD88-\uFD8A\uFD8C-\uFD8F\uFD92-\uFD95\uFD98\uFD9D\uFDB4-\uFDB5\uFDB8\uFDBA\uFDC3-\uFDC5\uFE8B\uFE91\uFE97\uFE9B\uFE9F\uFEA3\uFEA7\uFEB3\uFEB7\uFEBB\uFEBF\uFEC3\uFEC7\uFECB\uFECF\uFED3\uFED7\uFEDB\uFEDF\uFEE3\uFEE7\uFEEB\uFEF3]$/;

/** تصويت السطر: كم كلمة مقلوبة مقابل كم كلمة سليمة (حسب أشكال الحروف فقط) */
function visualVotes(strs: string[]): number {
  let v = 0;
  for (const s of strs) {
    for (const w of s.split(/\s+/)) {
      const ch = [...w].filter((c) => /[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(c));
      if (ch.length < 2) continue;
      const first = ch[0];
      const last = ch[ch.length - 1];
      if (FINAL_FORMS.test(first) || INITIAL_FORMS.test(last)) v++;
      if (INITIAL_FORMS.test(first) || FINAL_FORMS.test(last)) v--;
    }
  }
  return v;
}

export type PositionedItem = { str: string; x: number; y: number; w: number; h: number };

const isArabicStr = (s: string) => ARABIC.test(s);
const isLtrStr = (s: string) => /[A-Za-z0-9٠-٩]/.test(s) && !ARABIC.test(s);

/**
 * يبني الأسطر من مواضع العناصر (لا من ترتيب تخزينها): يجمّع حسب y، ويرتّب السطر العربي
 * من اليمين لليسار مع إبقاء مقاطع الأرقام/اللاتيني من اليسار لليمين، ويضع مسافة فقط عند وجود فجوة فعلية.
 */
export function assembleLines(items: PositionedItem[]): string {
  const its = items.filter((i) => i.str.length > 0 && Number.isFinite(i.x) && Number.isFinite(i.y));
  if (its.length === 0) return "";
  its.sort((a, b) => b.y - a.y);
  const lines: PositionedItem[][] = [];
  for (const it of its) {
    const line = lines[lines.length - 1];
    const ref = line?.[0];
    if (ref && Math.abs(ref.y - it.y) <= Math.max(ref.h, it.h, 1) * 0.5) line.push(it);
    else lines.push([it]);
  }
  return lines
    .map((line) => {
      const ar = line.reduce((n, i) => n + (i.str.match(/[؀-ۿ]/g)?.length ?? 0), 0);
      const la = line.reduce((n, i) => n + (i.str.match(/[A-Za-z]/g)?.length ?? 0), 0);
      const rtl = ar > la;
      const sorted = [...line].sort((a, b) => a.x - b.x);
      const ordered = rtl ? sorted.reverse() : sorted;
      const near = (p: PositionedItem, c: PositionedItem) => {
        const gap = c.x >= p.x ? c.x - (p.x + p.w) : p.x - (c.x + c.w);
        return gap <= Math.max(c.h, p.h, 1) * 0.18;
      };
      // كلمات = عناصر متلاصقة بصرياً
      const tokens: PositionedItem[][] = [];
      for (const it of ordered) {
        const last = tokens[tokens.length - 1];
        if (last && near(last[last.length - 1], it) && !it.str.startsWith(" ")) last.push(it);
        else tokens.push([it]);
      }
      let parts = tokens.map((tok) => tok);
      if (rtl) {
        // كلمات عربية مخزّنة مقلوبة داخلياً → اقلب حروف العنصر نفسه (ترتيب العناصر صحّحه الفرز بالموضع)
        if (visualVotes(line.map((i) => i.str)) > 0) {
          parts = parts.map((tok) => tok.map((i) => (isArabicStr(i.str) ? { ...i, str: [...i.str].reverse().join("") } : i)));
        }
        // رقم مع علامة ترقيم مخزّن مرئياً (".12" في آخر جملة عربية) → "12."
        parts = parts.map((tok) => tok.map((i) => (isLtrStr(i.str) ? { ...i, str: i.str.replace(/^([.,:;!?؟،]+)([0-9٠-٩].*)$/, "$2$1") } : i)));
        // كل كلمة أرقام/لاتيني تُقرأ داخلياً يساراً ← يميناً
        parts = parts.map((tok) => (tok.some((i) => isLtrStr(i.str)) && !tok.some((i) => isArabicStr(i.str)) ? [...tok].reverse() : tok));
        // كلمات لاتينية متتالية = عبارة واحدة باتجاهها الطبيعي (الأرقام والعمليات تبقى بترتيب الجملة العربية)
        const latin = (tok: PositionedItem[]) => tok.some((i) => /[A-Za-z]/.test(i.str)) && !tok.some((i) => isArabicStr(i.str));
        const merged: PositionedItem[][][] = [];
        for (const tok of parts) {
          const g = merged[merged.length - 1];
          if (g && latin(tok) && latin(g[g.length - 1])) g.push(tok);
          else merged.push([tok]);
        }
        parts = merged.flatMap((g) => (g.length > 1 ? [...g].reverse() : g));
      }
      return parts.map((tok) => tok.map((i) => i.str).join("")).join(" ").replace(/ +/g, " ");
    })
    .join("\n");
}

/**
 * تنظيف مخرجات OCR: لا نطبّق تخمين «الكلمات المقلوبة» (OCR يُخرج الترتيب المنطقي أصلاً).
 * التشكيل يُحذف لأن قراءته بالـ OCR غير موثوقة وتشوّه الكلمات.
 */
export function cleanOcrText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[​-‏‪-‮⁦-⁩]/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    // أسطر ضجيج من حافة الصفحة: حرف أو حرفان متفرقان («ع ع»)
    .filter((l) => l.length > 1 && !(l.split(" ").length <= 3 && l.split(" ").every((t) => [...t].length <= 1)))
    .join("\n");
}

/** صفحة OCR تُعدّ ذات نص إذا فيها 10 أحرف على الأقل (عتبة أخفض من النص الأصلي) */
export const hasOcrText = (t: string) => (t.match(/[\p{L}]/gu)?.length ?? 0) >= 10;

const EN_STOP = new Set(["the", "a", "an", "is", "are", "am", "i", "my", "you", "your", "he", "she", "it", "we", "they", "and", "to", "of", "in", "on", "at", "this", "that", "what", "how", "can", "have", "has", "do", "does", "name", "hello", "look", "me", "his", "her", "like", "go", "see", "one", "two", "yes", "no", "not", "with", "for", "from", "here", "there"]);

/**
 * حروف عربية أساسية فقط (بلا علامات التشكيل U+064B–065F وU+0670 ولا التطويل).
 * مهم: النص المشكَّل يُستخرج غالباً بحركات منفصلة («ُ» «َ» كأنها كلمات)، فلا تُعدّ هذه حروفاً.
 */
const AR_LETTER = /[\u0621-\u064A\u066E-\u06D3\u06FA-\u06FF]/;
const AR_LETTER_G = new RegExp(AR_LETTER.source, "g");
const arTokens = (text: string) => text.split(/\s+/).filter((t) => AR_LETTER.test(t));

/** نسبة «الكلمات» العربية المؤلفة من حرف أساسي واحد (علامة استخراج حرفاً حرفاً) — التشكيل المنفصل لا يُحتسب */
export function singleLetterShare(text: string): number {
  const toks = arTokens(text);
  if (toks.length < 20) return 0;
  const single = toks.filter((t) => [...t].filter((c) => AR_LETTER.test(c)).length === 1).length;
  return single / toks.length;
}

/**
 * طبقة نص عربية غير موثوقة (ترميز خطوط معطوب): كلمات عربية اختلط فيها حروف لاتينية أو رموز رياضية بدل الحروف/الحركات
 * (مثل «lمn≤oدuمnة»)، أو علامة الاستبدال U+FFFD داخل الكلمات (حروف ضائعة أو مبدَّلة: «م�َسْرُوع»، «�صِل�ْصلة»).
 * هذه الصفحات لا يُوثق بنصها، فتُقرأ بـ OCR.
 */
export function unreliableArabic(text: string): boolean {
  const toks = arTokens(text);
  if (toks.length < 15) return false;
  const mixed = toks.filter((t) => /[A-Za-z\uFFFD\u00C0-\u024F\u0192\u2190-\u22FF]/.test(t)).length;
  if (mixed / toks.length >= 0.12) return true;
  const fffd = text.match(/\uFFFD/g)?.length ?? 0;
  const letters = text.match(AR_LETTER_G)?.length ?? 0;
  return fffd >= 3 && letters > 0 && fffd / letters >= 0.005;
}

/**
 * نص مستخرج من طبقة نص معطوبة: عربية حرفاً حرفاً، أو عربية اختلط فيها لاتيني/رموز/FFFD، أو «لاتينية» بلا معنى،
 * أو لاتينية فيها رموز رياضية كثيرة (عربية مرسومة برموز Latin-1). مثل هذه الصفحة تُعامَل كأنها بلا نص فتُقرأ بـ OCR.
 */
export function isGarbageText(text: string): boolean {
  if (singleLetterShare(text) > 0.3) return true;
  if (unreliableArabic(text)) return true;
  const ar = text.match(/[\u0600-\u06FF]/g)?.length ?? 0;
  const la = text.match(/[A-Za-z]/g)?.length ?? 0;
  if (la > 60 && la > ar * 3) {
    // عربية مرسومة برموز Latin-1 والرياضيات («áneqón≤aodG è pgÉnæn rŸG ≈n∏»): نسبة الرموز الغريبة عالية
    const noise = text.match(/[\u0192\u00A3\u00A5\u00A4\u0178\u00E6\u00C6\u2190-\u22FF\u2020-\u2022]/g)?.length ?? 0;
    if (noise >= 6 && noise / (la + noise) >= 0.02) return true;
    // الإنكليزية الحقيقية (حتى قوائم المفردات بلا كلمات رابطة) نسبة حروفها العلّة ≈ 35–40%؛ الهراء الناتج عن ترميز خطوط
    // معطوب أقل بكثير. نشترط الشرطين معاً (قلة الكلمات الرابطة ونسبة العلّة المنخفضة) حتى لا تُرفض صفحة إنكليزية سليمة.
    const words = text.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 0);
    const vowels = (text.match(/[aeiouyAEIOUY]/g)?.length ?? 0) / la;
    if (words.length >= 20 && vowels < 0.22 && words.filter((w) => EN_STOP.has(w)).length / words.length < 0.05) return true;
  }
  return false;
}

/**
 * جودة نص مستخرج (0..1): حصة الكلمات «النظيفة» (حروف/أرقام فقط، بلا خلط عربي-لاتيني ولا U+FFFD ولا رموز)
 * مع كثافة الكلمات العربية الشائعة. تُستعمل للتحكيم بين طبقة نص معطوبة ونتيجة OCR لصفحة واحدة.
 */
export function textQuality(text: string): number {
  const toks = text.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").split(/\s+/).filter((t) => /\p{L}/u.test(t));
  if (toks.length < 5) return 0;
  const clean = toks.filter((t) => /^[\p{L}\p{N}.,:;!?()«»"'\-–/%+=×÷]+$/u.test(t) && !(/[\u0600-\u06FF]/.test(t) && /[A-Za-z]/.test(t))).length / toks.length;
  const common = Math.min(1, (arabicWordScore(text) / toks.length) * 3);
  return clean * 0.3 + common * 0.7;
}

/**
 * يختار لصفحة واحدة بين نص طبقة معطوبة (suspect) ونتيجة OCR: الأعلى جودة، مع تفضيل OCR عند التقارب (هامش 0.05).
 * suspect يُنظَّف من U+FFFD. يعيد null إن لم يصلح أيٌّ منهما.
 */
export function chooseBest(ocr: string | null, suspect: string | null): { text: string; source: "ocr" | "layer" } | null {
  const layer = suspect ? suspect.replace(/\uFFFD/g, "") : null;
  const qo = ocr && hasOcrText(ocr) ? textQuality(ocr) : -1;
  const ql = layer && hasRealText(layer) ? textQuality(layer) : -1;
  if (qo < 0 && ql < 0) return null;
  if (ql > qo + 0.05 && ql >= 0.5) return { text: layer!, source: "layer" };
  return qo >= 0 ? { text: ocr!, source: "ocr" } : ql >= 0.5 ? { text: layer!, source: "layer" } : null;
}
