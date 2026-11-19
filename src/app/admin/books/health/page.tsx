import Link from "next/link";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { CopyButton } from "@/components/CopyButton";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { adminCtx } from "@/server/admin/page";
import { buildReport, formatReport, issueMessage } from "@/server/books/health";
import { loadBookInputs } from "@/server/books/health-data";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const { admin, site, t } = await adminCtx("MANAGE_CURRICULUM");
  const h = t.health;
  const report = buildReport(await loadBookInputs(db, env.STORAGE_DIR));
  const rows = all === "1" ? report.books : report.books.filter((b) => b.level !== "ok");
  const tone = { error: "text-danger", warn: "text-brand", ok: "text-muted" } as const;
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={h.title}>
      <p className="mb-4 text-sm text-muted">{h.hint}</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([[h.total, report.summary.total, ""], [h.ok, report.summary.ok, "text-brand"], [h.warn, report.summary.warn, ""], [h.error, report.summary.error, "text-danger"]] as const).map(([l, v, c]) => (
          <div key={l} className="rounded-xl border border-line bg-surface p-4"><div className="text-sm text-muted">{l}</div><div className={`mt-1 text-2xl font-bold ${c}`} dir="ltr">{v}</div></div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/admin/books/health" className={all === "1" ? "text-brand" : "font-semibold"}>{h.onlyProblems}</Link>
        <Link href="/admin/books/health?all=1" className={all === "1" ? "font-semibold" : "text-brand"}>{h.all}</Link>
        <CopyButton text={formatReport(report)} label={h.copy} done={h.copied} />
        <Link href="/admin/books" className="ms-auto text-brand">{h.back}</Link>
      </div>
      <TableWrap>
        <thead><tr><Th>{t.books.name}</Th><Th>{h.pagesCol}</Th><Th>{h.issues}</Th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><Td>{h.none} ✓</Td></tr>}
          {rows.map((b) => (
            <tr key={b.id}>
              <Td className="max-w-64 break-words"><div dir="auto">{b.name}</div><Pill>{h[b.level]}</Pill></Td>
              <Td><span dir="ltr" className="text-xs">{b.stats.pages} · {b.stats.textPages} txt · {b.stats.ocrPages} ocr</span></Td>
              <Td>
                {b.issues.length === 0 ? <span className="text-muted">{h.none}</span> : (
                  <ul className="space-y-1 text-sm">
                    {b.issues.map((i, k) => (
                      <li key={k} className={i.severity === "info" ? "text-muted" : tone[i.severity === "error" ? "error" : "warn"]}>
                        {i.severity === "error" ? "✗" : i.severity === "warn" ? "!" : "·"} {issueMessage(i.code)}{i.detail && <span className="text-xs text-muted" dir="auto"> ({i.detail})</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {b.stats.pages > 0 && <Link href={`/admin/books/${b.id}`} className="mt-1 inline-block text-xs text-brand">{h.preview}</Link>}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </AdminShell>
  );
}
