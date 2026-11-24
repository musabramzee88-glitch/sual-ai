/**
 * شعار «سُؤال AI»: علامة استفهام عربية تنبت من كعب الكتاب المفتوح (الموقع يقرأ الكتاب ويطلّع منه أسئلة).
 * المصدر الوحيد للرسم: brand/icon.svg — أي تعديل هناك يُنقل هنا وتُعاد الصور بالسكربت الموثّق في brand/README.md.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="sual-logo-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f7f78" />
          <stop offset="1" stopColor="#0a5853" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="23" fill="url(#sual-logo-g)" />
      <g transform="translate(9 11) scale(.82)">
        <path d="M50 82 C40 76 27 75 13 78 V52 C27 49 40 50 50 56 Z" fill="#fff" />
        <path d="M50 82 C60 76 73 75 87 78 V52 C73 49 60 50 50 56 Z" fill="#fff" fillOpacity=".78" />
        <path
          transform="translate(100 0) scale(-1 1)"
          d="M37 23 C37 14 43.5 9 50.5 9 C58 9 63.5 14 63.5 21.5 C63.5 28.5 58 31 54 34 C51 36.3 50 38.5 50 43 V47"
          fill="none" stroke="#f5a524" strokeWidth="9.5" strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export function Logo({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold text-lg tracking-tight">
      <LogoMark />
      {label}
    </span>
  );
}
