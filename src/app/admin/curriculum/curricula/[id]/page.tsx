import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { ChaptersEditor } from "@/components/CurriculumEditors";
import { getCurriculumWithChapters } from "@/server/admin/curriculum";
import { adminCtx } from "@/server/admin/page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin, site, t, L, pick } = await adminCtx("MANAGE_CURRICULUM");
  const cur = await getCurriculumWithChapters(id);
  if (!cur) notFound();
  const c = t.cur;
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={cur.title}>
      <p className="mb-4 text-sm text-muted">{pick(cur.grade)}{cur.branch ? ` · ${pick(cur.branch)}` : ""} · {pick(cur.track)} · {pick(cur.subject)} · <span dir="ltr">{cur.academicYear.label}</span></p>
      <ChaptersEditor curriculumId={cur.id} initial={cur.chapters} L={L}
        t={{ chTitle: c.chTitle, from: c.from, to: c.to, add: c.add, up: c.up, down: c.down, remove: c.remove, save: c.save, saved: c.saved }} />
      <Link href="/admin/curriculum?tab=curricula" className="mt-6 inline-block text-sm text-brand">{c.back}</Link>
    </AdminShell>
  );
}
