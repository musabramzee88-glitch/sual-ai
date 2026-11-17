import Link from "next/link";
import { Logo } from "./Logo";

export function AuthShell({ brand, title, children }: { brand: string; title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Link href="/" className="mb-6 flex justify-center text-ink"><Logo label={brand} /></Link>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <h1 className="mb-5 text-xl font-bold">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
