export function Logo({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold text-lg tracking-tight">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <path d="M11 12.5a5 5 0 1 1 7 4.6c-1.3.6-2 1.4-2 2.9v.5" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <circle cx="16" cy="24.2" r="1.6" fill="var(--accent)" />
      </svg>
      {label}
    </span>
  );
}
