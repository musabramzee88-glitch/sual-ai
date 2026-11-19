"use client";
import { useState } from "react";

export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="rounded-lg border border-line px-4 py-2 text-sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* غير مدعوم */ }
    }}>{ok ? done : label}</button>
  );
}
