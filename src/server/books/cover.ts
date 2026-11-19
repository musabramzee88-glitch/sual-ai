import { guessGrade, guessKind, guessPart, guessSubject, normalizeName, type BookGuess } from "./names";

/**
 * تعرّف على الكتاب من نص غلافه/صفحاته الأولى (دوال نقية).
 * أسماء الملفات المحمّلة كثيراً ما تفقد حروفها العربية، فالمحتوى هو المصدر الموثوق.
 * confidence = high فقط عند وجود عبارة «للصف … الابتدائي/المتوسط/الإعدادي» صريحة ومادة في عنوانها.
 */
export type CoverGuess = BookGuess & { confidence: "high" | "low"; evidence: string };

const ORDINAL = "(?:الاول|الثاني|الثالث|الرابع|الخامس|السادس)";
const STAGE = "(?:\\S*ابتدا\\S*|\\S*متوسط\\S*|\\S*اعداد\\S*)";
const GRADE_PHRASE = new RegExp(`(?:للصف|الصف)\\s+(${ORDINAL})\\s+(${STAGE})`);

const EN_ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };

const count = (s: string, rx: RegExp) => s.match(rx)?.length ?? 0;

function guessEnglishCover(raw: string): CoverGuess | null {
  const ar = count(raw, /[؀-ۿ]/g);
  const la = count(raw, /[A-Za-z]/g);
  if (!(la > 30 && la > ar * 1.5 && /english/i.test(raw))) return null;
  const n = raw.toLowerCase();
  const num = /(?:primary|grade|class)\s*([1-6])\b/.exec(n)?.[1] ?? /\b([1-6])(?:st|nd|rd|th)\s*(?:primary|grade)/.exec(n)?.[1]
    ?? (() => { const m = /\b(first|second|third|fourth|fifth|sixth)\b[\s-]*(?:primary|grade)?/.exec(n); return m ? String(EN_ORD[m[1]]) : undefined; })();
  const primary = /primary|elementary/.test(n) || !!num;
  return {
    gradeCode: num && primary ? `PRI_${num}` : null,
    subjectCode: "ENGLISH",
    kind: /activity|workbook/.test(n) ? "ACTIVITY" : "TEXTBOOK",
    part: guessPart(n),
    confidence: num ? "high" : "low",
    evidence: raw.replace(/\s+/g, " ").trim().slice(0, 160),
  };
}

export function guessFromCover(raw: string): CoverGuess {
  const evidence = raw.replace(/\s+/g, " ").trim().slice(0, 160);
  const en = guessEnglishCover(raw);
  if (en) return en;

  const n = normalizeName(raw);
  const m = GRADE_PHRASE.exec(n);
  if (m) {
    const gradeCode = guessGrade(`${m[1]} ${m[2]}`);
    // العنوان يسبق «للصف …» عادةً: نافذة قصيرة قبل العبارة أولاً (تتجنب كلمات الوزارة وغيرها)
    const before = n.slice(Math.max(0, m.index - 70), m.index + m[0].length);
    const subjectCode = guessSubject(before);
    return { gradeCode, subjectCode, kind: guessKind(before), part: guessPart(n), confidence: gradeCode && subjectCode ? "high" : "low", evidence };
  }
  // لا عبارة صف صريحة: تخمين ضعيف من النص كله، يحتاج مراجعة
  return { gradeCode: guessGrade(n), subjectCode: guessSubject(n), kind: guessKind(n), part: guessPart(n), confidence: "low", evidence };
}

/**
 * مادة الكتاب من كلمات محتواه (احتياط ضعيف حين يغيب عنوان الغلاف). تُقبل فقط عند هيمنة واضحة،
 * ولا تُرفع بها الثقة (تبقى low فيراجعها المستخدم).
 */
const CONTENT_KEYWORDS: [string, RegExp][] = [
  ["MATH", /جمع|طرح|ضرب|قسمه|عدد|اعداد|كسر|كسور|معادله|هندسه|مثلث|مربع|زاويه|محيط|مساحه/g],
  ["SCIENCE", /نبات|حيوان|كائن|طاقه|مغناطيس|كوكب|حواس|مادة|مواد|ماء|هواء|تربه|ضوء|صوت/g],
  ["ISLAMIC", /الله|الرسول|القران|صلاه|اسلام|نبي|الايه|حديث/g],
  ["SOCIAL", /وطن|محافظه|عراق|خريطه|مدينه|حضاره|سكان|نهر/g],
];

export function guessSubjectFromContent(raw: string): string | null {
  const n = normalizeName(raw);
  if (n.length < 200) return null;
  const ar = count(raw, /[\u0600-\u06FF]/g);
  const la = count(raw, /[A-Za-z]/g);
  if (la > ar * 2 && la > 300) return "ENGLISH";
  const scores = CONTENT_KEYWORDS.map(([code, rx]) => [code, count(n, rx)] as const).sort((a, b) => b[1] - a[1]);
  const [top, second] = scores;
  return top[1] >= 15 && top[1] >= second[1] * 2 ? top[0] : null;
}
