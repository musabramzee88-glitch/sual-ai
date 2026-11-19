import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { adminCtx } from "@/server/admin/page";
import { getBook, getBookPage } from "@/server/books/service";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const { page: raw } = await searchParams;
  const { admin, site, t } = await adminCtx("MANAGE_CURRICULUM");
  const b = t.books;
  const book = await getBook(id);
  if (!book || !book.pageCount) notFound();
  const n = Math.min(Math.max(1, Number(raw) || 1), book.pageCount);
  const page = await getBookPage(id, n);
  const nav = (p: number, label: string) => <Link href={`/admin/books/${id}?page=${p}`} className="rounded-lg border border-line px-3 py-1 text-sm">{label}</Link>;
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={book.originalName}>
      <p className="mb-3 text-sm text-muted">{b.checkHint}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {n > 1 && nav(n - 1, b.prev)}
        <span className="text-sm">{b.page} {n} {b.of} {book.pageCount}</span>
        {n < book.pageCount && nav(n + 1, b.next)}
        <form className="flex items-center gap-1"><input name="page" type="number" min={1} max={book.pageCount} defaultValue={n} className="w-20 rounded-lg border border-line bg-paper px-2 py-1 text-sm" /><button className="rounded-lg border border-line px-3 py-1 text-sm">↵</button></form>
      </div>
      <pre className="whitespace-pre-wrap rounded-xl border border-line bg-surface p-4 font-sans text-base leading-8">{page?.text || b.noText}</pre>
      <Link href="/admin/books" className="mt-6 inline-block text-sm text-brand">{b.back}</Link>
    </AdminShell>
  );
}
