/** نص ملف Dart للتطبيق من القوائم المشتركة (نقي). انظر scripts/gen-mobile-catalog.ts */
import { GENERATABLE_TYPES, QT, QUESTION_TYPES, VERBATIM_TYPES } from "./question-types";
import { ACCENTS, FONTS, HEADER_KEYS, HIDDEN_BY_DEFAULT, LABELS } from "./exam-render";
import { examDicts } from "./i18n/exams";
import { dictionaries } from "./i18n/dictionaries";
import { templateDicts } from "./i18n/templates";

const s = (x: string) => `'${x.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$/g, "\\$").replace(/\n/g, "\\n")}'`;
const list = (xs: readonly string[]) => `[${xs.map(s).join(", ")}]`;
const map = (o: Record<string, string>) => `{${Object.entries(o).map(([k, v]) => `${s(k)}: ${s(v)}`).join(", ")}}`;

export function mobileCatalog(): string {
  const types = QUESTION_TYPES.map((t) => `  ${s(t)}: QType(${s(t)}, ${s(QT[t].ar)}, ${s(QT[t].en)}, ${s(QT[t].instAr)}),`).join("\n");
  return `// مولَّد تلقائياً من الموقع (scripts/gen-mobile-catalog.ts). لا تعدّله يدوياً.
// ignore_for_file: constant_identifier_names

class QType {
  const QType(this.code, this.ar, this.en, this.instAr);
  final String code;
  final String ar;
  final String en;
  final String instAr;
}

const qTypes = <String, QType>{
${types}
};

const generatableTypes = ${list(GENERATABLE_TYPES)};
const verbatimTypes = ${list(VERBATIM_TYPES)};
const headerKeys = ${list(HEADER_KEYS)};
const hiddenByDefault = ${list(HIDDEN_BY_DEFAULT)};
const headerLabelsAr = ${map(LABELS.ar)};
const fonts = ${list(FONTS)};
const accents = ${list(ACCENTS)};
const layouts = ['CLASSIC', 'SCHOOL', 'ACADEMIC', 'MINIMAL'];
const layoutNamesAr = {'CLASSIC': 'كلاسيكي', 'SCHOOL': 'مدرسي', 'ACADEMIC': 'أكاديمي', 'MINIMAL': 'بسيط'};
const examKinds = ${map(examDicts.ar.kinds)};
const difficulties = ${map(examDicts.ar.difficulties)};
const tableStyles = ${map(examDicts.ar.editor.media.tableStyles)};
/** رسائل الأخطاء (الحساب + الامتحانات + القوالب) كما في الموقع */
const errorsAr = ${map({ ...(templateDicts.ar.errors as Record<string, string>), ...dictionaries.ar.auth.errors, ...examDicts.ar.errors })};
/** حالة الحساب (resolveAccess) */
const accessStatesAr = ${map(dictionaries.ar.dashboard.states)};
`;
}
