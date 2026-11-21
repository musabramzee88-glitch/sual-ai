/**
 * فهرس أنواع الأسئلة (مصدر واحد): الأسماء AR/EN، تعليمات الورقة بأسلوب الامتحانات العراقية، تلميح للنموذج،
 * والأنواع الافتراضية لكل مادة. يستعمله المعالج والتوليد ولوحة الإدارة والبذور والـ migration.
 * أي نوع جديد: أضفه إلى enum QuestionType (migration) ثم هنا.
 */
export const QUESTION_TYPES = [
  // عامة
  "MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCHING", "DEFINE", "JUSTIFY", "COMPARE", "LIST", "WHAT_IF", "ESSAY", "APPLIED", "COMPREHENSION",
  // رياضيات وعلوم
  "COMPUTE", "PROBLEM", "PROOF", "EQUATION_BALANCING", "DIAGRAM", "ALGORITHM",
  // التربية الإسلامية والأخلاقية
  "COMPLETE_VERSE", "WRITE_VERSE", "EXPLAIN_VERSE", "WRITE_HADITH", "TAJWEED", "LESSONS", "SITUATION",
  // العربية
  "WORD_MEANINGS", "WORD_FORMS", "COMPLETE_POEM", "GRAMMAR_PARSING", "EXTRACT", "CONVERT", "CORRECT_ERROR", "WRITING",
  // اللغات الأجنبية
  "REORDER", "VERB_FORMS",
] as const;
export type QType = (typeof QUESTION_TYPES)[number];

/** أنواع لا يولّدها النموذج (تحتاج رسماً) */
export const NOT_GENERATABLE: readonly QType[] = ["DIAGRAM"];
export const GENERATABLE_TYPES = QUESTION_TYPES.filter((t) => !NOT_GENERATABLE.includes(t));

/** نص منقول حرفياً من الكتاب (قرآن، حديث، شعر): يُطابَق مع صفحة المصدر ويُنبَّه المدرس لمراجعته */
export const VERBATIM_TYPES: readonly QType[] = ["COMPLETE_VERSE", "WRITE_VERSE", "WRITE_HADITH", "COMPLETE_POEM"];

type Def = { ar: string; en: string; instAr: string; instEn: string; hint: string };

export const QT: Record<QType, Def> = {
  MCQ: { ar: "اختيار من متعدد", en: "Multiple choice", instAr: "اختر الإجابة الصحيحة لكل مما يأتي:", instEn: "Choose the correct answer:", hint: "four options exactly; answer must equal one option verbatim" },
  TRUE_FALSE: { ar: "صح وخطأ مع التصحيح", en: "True / False", instAr: "ضع كلمة (صح) أمام العبارة الصحيحة وكلمة (خطأ) أمام العبارة الخاطئة مع تصحيح الخطأ:", instEn: "Write True or False and correct the false ones:", hint: "a statement; answer is صح/خطأ (True/False for English); for خطأ add the correction after a dash" },
  FILL_BLANK: { ar: "املأ الفراغ", en: "Fill in the blank", instAr: "املأ الفراغات الآتية بما يناسبها:", instEn: "Fill in the blanks:", hint: "use ...... for each blank; answer lists the missing words in order" },
  MATCHING: { ar: "صِل بين العمودين", en: "Matching", instAr: "صِل بين العمود (أ) وما يناسبه من العمود (ب):", instEn: "Match column A with column B:", hint: "write both columns inside the prompt: column A numbered 1..n, column B lettered and shuffled (4-6 items); answer is the pairs like 1-ب، 2-أ" },
  DEFINE: { ar: "عرّف", en: "Define", instAr: "عرّف ما يأتي:", instEn: "Define:", hint: "a term defined in the book; answer is the book's definition" },
  JUSTIFY: { ar: "علّل", en: "Give reasons", instAr: "علّل ما يأتي:", instEn: "Give reasons:", hint: "a fact from the book whose reason is stated in the book" },
  COMPARE: { ar: "قارن", en: "Compare", instAr: "قارن بين ما يأتي:", instEn: "Compare:", hint: "two related concepts from the book; answer gives the differences point by point" },
  LIST: { ar: "عدّد / اذكر", en: "List", instAr: "عدّد ما يأتي:", instEn: "List:", hint: "ask to list N items the book enumerates (e.g. عدّد ثلاثاً من...); answer lists them" },
  WHAT_IF: { ar: "ماذا يحدث لو", en: "What happens if", instAr: "ماذا يحدث في الحالات الآتية؟", instEn: "What happens if:", hint: "a cause whose result is stated in the book (ماذا يحدث لو / ماذا يترتب على); answer per the book" },
  ESSAY: { ar: "أسئلة مقالية", en: "Essay", instAr: "أجب عن الأسئلة الآتية:", instEn: "Answer the following:", hint: "an open question; answer lists the expected points" },
  APPLIED: { ar: "تطبيقية", en: "Applied", instAr: "أجب عن الأسئلة التطبيقية الآتية:", instEn: "Applied questions:", hint: "apply a concept from the book to a real situation" },
  COMPREHENSION: { ar: "فهم واستيعاب", en: "Comprehension", instAr: "اقرأ ثم أجب:", instEn: "Read and answer:", hint: "a question about a passage or lesson text in the book (main idea, details, meaning)" },
  COMPUTE: { ar: "جد الناتج", en: "Calculate", instAr: "جد ناتج ما يأتي:", instEn: "Find the result:", hint: "a direct calculation using the book's skills with NEW numbers; answer gives short working and the result" },
  PROBLEM: { ar: "مسائل", en: "Problems", instAr: "حلّ المسائل الآتية:", instEn: "Solve:", hint: "a word problem like the book's examples, with NEW numbers; answer shows full working and final result with units" },
  PROOF: { ar: "إثبات / اشتقاق", en: "Proof / derivation", instAr: "أثبت ما يأتي:", instEn: "Prove:", hint: "a statement provable (or a law derivable) with the book's theorems; answer is the proof" },
  EQUATION_BALANCING: { ar: "معادلات كيميائية", en: "Chemical equations", instAr: "اكتب المعادلات الكيميائية الآتية ووازنها:", instEn: "Write and balance:", hint: "a reaction from the book described in words; answer is the balanced equation" },
  DIAGRAM: { ar: "رسومات وأشكال", en: "Diagrams", instAr: "أجب مستعيناً بالأشكال:", instEn: "Answer using the diagrams:", hint: "" },
  ALGORITHM: { ar: "خوارزمية / برنامج", en: "Algorithm / program", instAr: "اكتب خوارزمية (أو برنامجاً) لما يأتي:", instEn: "Write an algorithm / program:", hint: "a small task solvable with what the book teaches; answer is numbered steps or code in the book's language" },
  COMPLETE_VERSE: { ar: "أكمل الآيات الكريمة", en: "Complete the verses", instAr: "أكمل الآيات الكريمة الآتية:", instEn: "Complete the verses:", hint: "copy the START of a Quranic verse from the source EXACTLY (same words and diacritics) then ......; answer is the EXACT continuation copied from the source. Never write any Quran text that is not printed in the source pages" },
  WRITE_VERSE: { ar: "اكتب الآية الدالة", en: "Write the verse", instAr: "اكتب الآية الكريمة التي تدل على كل مما يأتي:", instEn: "Write the verse indicating:", hint: "state a meaning from the lesson; answer is the EXACT verse copied from the source pages" },
  EXPLAIN_VERSE: { ar: "فسّر / وضّح المعنى", en: "Explain", instAr: "وضّح ما يُفهم من كل مما يأتي:", instEn: "Explain:", hint: "quote (exactly) a short part of a verse or hadith from the source and ask for its meaning/what is understood; answer per the book's explanation" },
  WRITE_HADITH: { ar: "اذكر الحديث الشريف", en: "Write the hadith", instAr: "اكتب الحديث الشريف الذي يدل على كل مما يأتي:", instEn: "Write the hadith indicating:", hint: "state the topic of a hadith in the lesson; answer is the EXACT hadith text copied from the source, with its narrator if printed" },
  TAJWEED: { ar: "أحكام التلاوة", en: "Tajweed rules", instAr: "بيّن حكم التلاوة فيما يأتي:", instEn: "State the tajweed rule:", hint: "quote a word/phrase from the source verses with the relevant letters in [brackets]; answer is the rule as taught in the book, with its reason" },
  LESSONS: { ar: "ما يُستفاد", en: "Lessons learned", instAr: "ما الذي تستفيده مما يأتي؟", instEn: "What do you learn from:", hint: "a verse, hadith, story or lesson from the source; answer lists the lessons the book states" },
  SITUATION: { ar: "مواقف (ماذا تفعل)", en: "Situations", instAr: "ماذا تفعل في المواقف الآتية؟", instEn: "What would you do?", hint: "a realistic school/home situation related to the lesson's values; answer is the expected behaviour per the book" },
  WORD_MEANINGS: { ar: "معاني الكلمات", en: "Word meanings", instAr: "هات معاني الكلمات الآتية:", instEn: "Give the meaning of:", hint: "words from the lesson's vocabulary (معاني المفردات); answer gives the book's meaning" },
  WORD_FORMS: { ar: "المفرد والجمع والضد", en: "Word forms", instAr: "هات ما يُطلب منك:", instEn: "Give the required form:", hint: "ask for the singular / plural / opposite / synonym of a word from the lesson (say which in the prompt); answer is the form" },
  COMPLETE_POEM: { ar: "أكمل الأبيات (المحفوظات)", en: "Complete the poem", instAr: "أكمل الأبيات الآتية:", instEn: "Complete the lines:", hint: "copy the first line(s) of a memorised poem (للحفظ) from the source EXACTLY then ......; answer is the EXACT continuation copied from the source" },
  GRAMMAR_PARSING: { ar: "إعراب", en: "Parsing (إعراب)", instAr: "أعرب ما بين القوسين:", instEn: "Parse the words in brackets:", hint: "a sentence (from the book or similar) with the word to parse in [square brackets]; answer is the full إعراب" },
  EXTRACT: { ar: "استخرج", en: "Extract", instAr: "استخرج مما يأتي ما هو مطلوب:", instEn: "Extract:", hint: "give a short passage or sentence (from the book or similar) and say exactly what to extract (e.g. فاعلاً، مبتدأً، اسم إشارة، فعلاً مضارعاً); answer lists them" },
  CONVERT: { ar: "حوّل", en: "Change as required", instAr: "حوّل الجمل الآتية كما هو مطلوب بين القوسين:", instEn: "Change as required:", hint: "a sentence plus the transformation taught in the book (to dual/plural/feminine/negative/question/passive...) in brackets; answer is the transformed sentence" },
  CORRECT_ERROR: { ar: "صحّح الخطأ", en: "Correct the mistake", instAr: "صحّح الخطأ في الجمل الآتية:", instEn: "Correct the mistakes:", hint: "a sentence with exactly one deliberate mistake related to the lesson; answer is the corrected sentence" },
  WRITING: { ar: "التعبير / الإنشاء", en: "Writing", instAr: "اكتب موضوعاً تعبيرياً في واحد مما يأتي:", instEn: "Write about:", hint: "a writing task on a lesson topic with 2-3 guiding points; answer lists the expected elements" },
  REORDER: { ar: "رتّب الكلمات", en: "Put in order", instAr: "رتّب الكلمات الآتية لتكوّن جملاً مفيدة:", instEn: "Put the words in order to make sentences:", hint: "the words of a sentence from the lesson, shuffled and separated by ' / '; answer is the correct sentence" },
  VERB_FORMS: { ar: "صيغة الفعل الصحيحة", en: "Verb forms", instAr: "اكتب الفعل بالصيغة الصحيحة:", instEn: "Correct the verbs between brackets:", hint: "a sentence with the base verb in (brackets) to put in the correct tense/form taught in the book; answer is the full correct sentence" },
};

/** الأنواع الافتراضية لكل مادة (بأسلوب امتحانات وزارة التربية العراقية) */
const SCIENCE_CORE: QType[] = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "DEFINE", "JUSTIFY", "WHAT_IF", "COMPARE", "LIST"];
const SOCIAL_CORE: QType[] = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCHING", "DEFINE", "JUSTIFY", "WHAT_IF", "COMPARE", "LIST", "ESSAY"];
const LANG_CORE: QType[] = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCHING", "REORDER", "VERB_FORMS", "CORRECT_ERROR", "CONVERT", "WORD_MEANINGS", "WORD_FORMS", "COMPREHENSION", "WRITING", "ESSAY"];

export const SUBJECT_TYPES: Record<string, QType[]> = {
  ISLAMIC: ["COMPLETE_VERSE", "WRITE_VERSE", "EXPLAIN_VERSE", "WORD_MEANINGS", "WRITE_HADITH", "LESSONS", "TAJWEED", "DEFINE", "JUSTIFY", "LIST", "COMPARE", "MCQ", "TRUE_FALSE", "FILL_BLANK", "ESSAY"],
  ETHICS: ["SITUATION", "LESSONS", "LIST", "JUSTIFY", "DEFINE", "MCQ", "TRUE_FALSE", "FILL_BLANK", "MATCHING", "ESSAY"],
  READING: ["COMPREHENSION", "WORD_MEANINGS", "WORD_FORMS", "COMPLETE_POEM", "LESSONS", "JUSTIFY", "EXTRACT", "MCQ", "TRUE_FALSE", "FILL_BLANK", "WRITING", "ESSAY"],
  GRAMMAR: ["GRAMMAR_PARSING", "EXTRACT", "CONVERT", "CORRECT_ERROR", "DEFINE", "JUSTIFY", "MCQ", "TRUE_FALSE", "FILL_BLANK"],
  ARABIC: ["COMPREHENSION", "WORD_MEANINGS", "WORD_FORMS", "COMPLETE_POEM", "GRAMMAR_PARSING", "EXTRACT", "CONVERT", "CORRECT_ERROR", "DEFINE", "JUSTIFY", "LESSONS", "MCQ", "TRUE_FALSE", "FILL_BLANK", "WRITING", "ESSAY"],
  ENGLISH: LANG_CORE,
  FRENCH: LANG_CORE,
  KURDISH: LANG_CORE,
  MATH: ["COMPUTE", "PROBLEM", "MCQ", "TRUE_FALSE", "FILL_BLANK", "PROOF", "APPLIED", "DEFINE", "DIAGRAM"],
  PHYSICS: ["PROBLEM", ...SCIENCE_CORE, "PROOF", "APPLIED", "ESSAY", "DIAGRAM"],
  CHEMISTRY: ["EQUATION_BALANCING", "PROBLEM", ...SCIENCE_CORE, "APPLIED", "DIAGRAM"],
  BIOLOGY: [...SCIENCE_CORE, "ESSAY", "COMPREHENSION", "DIAGRAM"],
  SCIENCE: [...SCIENCE_CORE, "PROBLEM", "APPLIED", "ESSAY", "DIAGRAM"],
  SOCIAL: [...SOCIAL_CORE, "DIAGRAM"],
  HISTORY: SOCIAL_CORE,
  GEOGRAPHY: [...SOCIAL_CORE, "DIAGRAM"],
  ECONOMICS: [...SOCIAL_CORE, "PROBLEM"],
  COMPUTER: ["DEFINE", "LIST", "COMPARE", "JUSTIFY", "MCQ", "TRUE_FALSE", "FILL_BLANK", "ALGORITHM", "APPLIED", "PROBLEM"],
  ART: ["MCQ", "TRUE_FALSE", "FILL_BLANK", "DEFINE", "LIST", "APPLIED"],
  PE: ["MCQ", "TRUE_FALSE", "FILL_BLANK", "DEFINE", "LIST"],
  MUSIC: ["MCQ", "TRUE_FALSE", "FILL_BLANK", "DEFINE", "LIST"],
};

export const qtLabels = (lang: "ar" | "en") => Object.fromEntries(QUESTION_TYPES.map((t) => [t, lang === "en" ? QT[t].en : QT[t].ar])) as Record<string, string>;
