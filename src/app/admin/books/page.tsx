import Link from "next/link";
import { Act } from "@/components/AdminActions";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { AutoRefresh, CancelAll, Dropzone, LinkSelect, ReprocessFailed, ReviewBoard } from "@/components/BookUploader";
import { db } from "@/server/db";
import { adminCtx } from "@/server/admin/page";
import { listOccupiedKeys, listReview } from "@/server/books/bulk";
import { listLibraryBooks, STALE_MS } from "@/server/books/service";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { admin, site, t, L, pick } = await adminCtx("MANAGE_CURRICULUM");
  const b = t.books;
  const [books, review, occupied, tracks, grades, subjects, curricula] = await Promise.all([
    listLibraryBooks(),
    listReview(),
    listOccupiedKeys(),
    db.curriculumTrack.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.grade.findMany({ where: { isActive: true }, orderBy: [{ stage: { sortOrder: "asc" } }, { sortOrder: "asc" }] }),
    db.subject.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.curriculum.findMany({ where: { isActive: true }, orderBy: [{ grade: { sortOrder: "asc" } }, { title: "asc" }], include: { grade: true } }),
  ]);
  const opts: [string, string][] = curricula.map((c) => [c.id, `${pick(c.grade)} · ${c.title}${c.kind !== "TEXTBOOK" ? ` (${t.cur.kinds[c.kind]})` : ""}`]);
  const confirmed = books.filter((x) => x.confirmedAt !== null);
  const isStuck = (x: (typeof books)[number]) => x.status === "PROCESSING" && Date.now() - x.updatedAt.getTime() > STALE_MS;
  const running = books.filter((x) => (x.status === "UPLOADED" || x.status === "PROCESSING") && !isStuck(x)).length;
  const busy = running > 0 || review.some((r) => r.working);
  const needOcr = books.some((x) => x.status === "FAILED" && (x.error === "NEEDS_OCR" || x.error === "CANCELLED"));

  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={b.title}>
      <AutoRefresh active={busy} />
      <Dropzone L={L} t={{ dropTitle: b.dropTitle, dropHint: b.dropHint, uploading: b.uploading, queued: b.queued, uploaded: b.uploaded, ocrToggle: b.ocrToggle, ocrToggleHint: b.ocrToggleHint }} />

      <div className="my-4 flex flex-wrap items-center gap-3">
        {running > 0 && <><span className="text-sm text-muted">{b.reading}: {running}</span><CancelAll L={L} label={b.cancelAll} /></>}
        {needOcr && <ReprocessFailed L={L} label={b.reprocessFailed} queued={b.reprocessQueued} />}
      </div>

      <ReviewBoard
        L={L}
        items={review.map((r) => ({ ...r, name: r.originalName }))} occupied={occupied}
        tracks={tracks.map((x) => [x.code, pick(x)])} grades={grades.map((x) => [x.code, pick(x)])} subjects={subjects.map((x) => [x.code, pick(x)])} kinds={Object.entries(t.cur.kinds)}
        t={{
          reviewTitle: b.reviewTitle, reviewEmpty: b.reviewEmpty, reviewHint: b.reviewHint, confirm: b.confirm, confirmAll: b.confirmAll, sureTag: b.sureTag, checkTag: b.checkTag, autoTag: b.autoTag,
          working: b.working, needsOcrTag: b.needsOcrTag, readOcr: b.readOcr, fromCover: b.fromCover, pickGrade: b.pickGrade, pickSubject: b.pickSubject, track: t.cur.track, grade: t.cur.grade, subject: t.cur.subject,
          kind: t.cur.kind, remove: b.remove, ocrPage: b.ocrPage, failedOcr: b.failedOcr, part: t.cur.part, parts: t.cur.parts, partConflict: b.partConflict,
        }}
      />

      <details className="mt-10 rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">{b.libraryTitle} ({confirmed.length})</summary>
        <div className="mt-4">
          <TableWrap>
            <thead><tr><Th>{b.name}</Th><Th>{b.size}</Th><Th>{b.pages}</Th><Th>{b.textPages}</Th><Th>{b.status}</Th><Th>{b.curriculum}</Th><Th>{t.common.actions}</Th></tr></thead>
            <tbody>
              {confirmed.length === 0 && <tr><Td>{b.empty}</Td></tr>}
              {confirmed.map((x) => (
                <tr key={x.id}>
                  <Td className="max-w-64 break-words">{x.originalName}</Td>
                  <Td><span dir="ltr">{(x.sizeBytes / 1048576).toFixed(1)} MB</span></Td>
                  <Td>{x.pageCount ?? "—"}</Td>
                  <Td>{x.textPageCount ?? "—"}</Td>
                  <Td><Pill>{b.st[x.status]}</Pill>{x.error && <div className={`mt-1 text-xs ${x.status === "FAILED" ? "text-danger" : "text-muted"}`}>{b.err[x.error] ?? x.error}</div>}</Td>
                  <Td><LinkSelect L={L} bookId={x.id} value={x.curriculumId} options={opts} none={b.none} /></Td>
                  <Td><div className="flex flex-wrap gap-1">
                    {x.pageCount ? <Link href={`/admin/books/${x.id}`} className="rounded-lg border border-line px-3 py-1 text-xs">{b.preview}</Link> : null}
                    {(x.status !== "PROCESSING" || isStuck(x)) && <Act L={L} url={`/api/v1/admin/books/${x.id}`} body={{ action: "reprocess" }} label={x.status === "FAILED" && (x.error === "NEEDS_OCR" || x.error === "CANCELLED") ? b.readOcr : b.reprocess} />}
                    {(x.status !== "PROCESSING" || isStuck(x)) && <Act L={L} method="DELETE" url={`/api/v1/admin/books/${x.id}`} label={b.remove} tone="danger" confirmText />}
                  </div></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      </details>
    </AdminShell>
  );
}
