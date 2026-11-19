import Link from "next/link";
import { Act } from "@/components/AdminActions";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { AutoRefresh, BookUploader, LinkSelect } from "@/components/BookUploader";
import { db } from "@/server/db";
import { adminCtx } from "@/server/admin/page";
import { listLibraryBooks } from "@/server/books/service";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { admin, site, t, L, pick } = await adminCtx("MANAGE_CURRICULUM");
  const b = t.books;
  const [books, curricula] = await Promise.all([
    listLibraryBooks(),
    db.curriculum.findMany({ where: { isActive: true }, orderBy: [{ grade: { sortOrder: "asc" } }, { title: "asc" }], include: { grade: true, subject: true, track: true } }),
  ]);
  const opts: [string, string][] = curricula.map((c) => [c.id, `${pick(c.grade)} · ${pick(c.track)} · ${c.title}`]);
  const busy = books.some((x) => x.status === "UPLOADED" || x.status === "PROCESSING");
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={b.title}>
      <AutoRefresh active={busy} />
      <p className="mb-4 text-sm text-muted">{b.hint}</p>
      <BookUploader L={L} t={{ choose: b.choose, upload: b.upload, uploading: b.uploading, queued: b.queued, uploaded: b.uploaded }} />
      <div className="mt-6">
        <TableWrap>
          <thead><tr><Th>{b.name}</Th><Th>{b.size}</Th><Th>{b.pages}</Th><Th>{b.textPages}</Th><Th>{b.status}</Th><Th>{b.curriculum}</Th><Th>{t.common.actions}</Th></tr></thead>
          <tbody>
            {books.length === 0 && <tr><Td>{b.empty}</Td></tr>}
            {books.map((x) => (
              <tr key={x.id}>
                <Td className="max-w-64 break-words">{x.originalName}</Td>
                <Td><span dir="ltr">{(x.sizeBytes / 1048576).toFixed(1)} MB</span></Td>
                <Td>{x.pageCount ?? "—"}</Td>
                <Td>{x.textPageCount ?? "—"}</Td>
                <Td><Pill>{b.st[x.status]}</Pill>{x.error && <div className={`mt-1 text-xs ${x.status === "FAILED" ? "text-danger" : "text-muted"}`}>{b.err[x.error] ?? x.error}</div>}</Td>
                <Td><LinkSelect L={L} bookId={x.id} value={x.curriculumId} options={opts} none={b.none} /></Td>
                <Td><div className="flex flex-wrap gap-1">
                  {x.pageCount ? <Link href={`/admin/books/${x.id}`} className="rounded-lg border border-line px-3 py-1 text-xs">{b.preview}</Link> : null}
                  {x.status !== "PROCESSING" && <Act L={L} url={`/api/v1/admin/books/${x.id}`} body={{ action: "reprocess" }} label={b.reprocess} />}
                  {x.status !== "PROCESSING" && <Act L={L} method="DELETE" url={`/api/v1/admin/books/${x.id}`} label={b.remove} tone="danger" confirmText />}
                </div></Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </AdminShell>
  );
}
