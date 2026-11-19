import Link from "next/link";
import { Act } from "@/components/AdminActions";
import { CancelAll, ReprocessFailed } from "@/components/BookUploader";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { AutoRefresh, BookUploader, BulkLink, LinkSelect } from "@/components/BookUploader";
import { db } from "@/server/db";
import { adminCtx } from "@/server/admin/page";
import { proposeLinks } from "@/server/books/bulk";
import { listLibraryBooks, STALE_MS } from "@/server/books/service";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { admin, site, t, L, pick } = await adminCtx("MANAGE_CURRICULUM");
  const b = t.books;
  const [books, proposals, tracks, grades, subjects] = await Promise.all([
    listLibraryBooks(),
    proposeLinks(),
    db.curriculumTrack.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.grade.findMany({ where: { isActive: true }, orderBy: [{ stage: { sortOrder: "asc" } }, { sortOrder: "asc" }] }),
    db.subject.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const curricula = await db.curriculum.findMany({ where: { isActive: true }, orderBy: [{ grade: { sortOrder: "asc" } }, { title: "asc" }], include: { grade: true, subject: true, track: true } });
  const opts: [string, string][] = curricula.map((c) => [c.id, `${pick(c.grade)} · ${c.title}${c.kind !== "TEXTBOOK" ? ` (${t.cur.kinds[c.kind]})` : ""}`]);
  const isStuck = (x: (typeof books)[number]) => x.status === "PROCESSING" && Date.now() - x.updatedAt.getTime() > STALE_MS;
  const running = books.filter((x) => (x.status === "UPLOADED" || x.status === "PROCESSING") && !isStuck(x)).length;
  const busy = running > 0;
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={b.title}>
      <AutoRefresh active={busy} />
      <p className="mb-4 text-sm text-muted">{b.hint}</p>
      {busy && <div className="mb-3 flex flex-wrap items-center gap-3"><span className="text-sm text-muted">{b.reading}: {running}</span><CancelAll L={L} label={b.cancelAll} /></div>}
      {books.some((x) => x.status === "FAILED" && (x.error === "NEEDS_OCR" || x.error === "CANCELLED")) && <ReprocessFailed L={L} label={b.reprocessFailed} queued={b.reprocessQueued} />}
      <BookUploader L={L} t={{ choose: b.choose, upload: b.upload, uploading: b.uploading, queued: b.queued, uploaded: b.uploaded, ocrToggle: b.ocrToggle, ocrToggleHint: b.ocrToggleHint }} />
      <div className="mt-6">
        <BulkLink L={L} t={{ ...b, kind: t.cur.kind, name: b.name }} tracks={tracks.map((x) => [x.code, pick(x)])} grades={grades.map((x) => [x.code, pick(x)])} subjects={subjects.map((x) => [x.code, pick(x)])}
          kinds={Object.entries(t.cur.kinds)} initial={proposals.map((p) => ({ id: p.id, name: p.originalName, grade: p.guess.gradeCode, subject: p.guess.subjectCode, kind: p.guess.kind }))} />
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
                <Td><Pill>{b.st[x.status]}</Pill>{isStuck(x) && <div className="mt-1 text-xs text-danger">{b.stuck}</div>}{x.status === "PROCESSING" && !isStuck(x) && x.pageCount ? <div className="mt-1 text-xs text-muted">{b.reading}: <span dir="ltr">{x.processedPages}/{x.pageCount}</span></div> : null}{x.error && <div className={`mt-1 text-xs ${x.status === "FAILED" ? "text-danger" : "text-muted"}`}>{b.err[x.error] ?? x.error}</div>}</Td>
                <Td><LinkSelect L={L} bookId={x.id} value={x.curriculumId} options={opts} none={b.none} /></Td>
                <Td><div className="flex flex-wrap gap-1">
                  {x.pageCount ? <Link href={`/admin/books/${x.id}`} className="rounded-lg border border-line px-3 py-1 text-xs">{b.preview}</Link> : null}
                  {x.status === "PROCESSING" && !isStuck(x) && <Act L={L} url={`/api/v1/admin/books/${x.id}`} body={{ action: "cancel" }} label={b.cancel} tone="danger" />}
                  {(x.status !== "PROCESSING" || isStuck(x)) && <Act L={L} url={`/api/v1/admin/books/${x.id}`} body={{ action: "reprocess" }} label={x.status === "FAILED" && (x.error === "NEEDS_OCR" || x.error === "CANCELLED") ? b.readOcr : b.reprocess} />}
                  {(x.status !== "PROCESSING" || isStuck(x)) && <Act L={L} method="DELETE" url={`/api/v1/admin/books/${x.id}`} label={b.remove} tone="danger" confirmText />}
                </div></Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </AdminShell>
  );
}
