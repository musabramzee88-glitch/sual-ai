/**
 * نص سؤال قد يخلط العربية بتعابير رياضية/لاتينية: تُعزل المقاطع اللاتينية/الرقمية بـ dir="ltr" + unicode-bidi: isolate
 * (قاعدة المشروع) حتى لا ينقلب ترتيب «2x + 3 = 7» داخل جملة عربية. مكوّن عرض نقي (بلا حالة).
 */
const RUN = /[A-Za-z0-9][A-Za-z0-9\s+\-−×÷=*/^().,√π<>≤≥²³%[\]{}|']*[A-Za-z0-9)²³%\]}|']|[A-Za-z0-9]/g;

export function MathText({ text, className }: { text: string; className?: string }) {
  if (!/[؀-ۿ]/.test(text)) return <span className={className} dir="auto">{text}</span>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(RUN)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(<span key={i} dir="ltr" className="[unicode-bidi:isolate]">{m[0]}</span>);
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={`whitespace-pre-line ${className ?? ""}`}>{parts}</span>;
}
