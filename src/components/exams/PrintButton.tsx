"use client";
export function PrintButton({ label }: { label: string }) {
  return <button className="rounded-lg bg-brand px-4 py-2 font-semibold text-white print:hidden dark:text-paper" onClick={() => window.print()}>{label}</button>;
}
