import { AdminShell } from "@/components/AdminShell";
import { SampleCard, SampleUpload, type SampleLabels } from "@/components/SamplesManager";
import { db } from "@/server/db";
import { adminCtx } from "@/server/admin/page";
import { listSamples } from "@/server/exams/samples";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { admin, site, t, L, pick } = await adminCtx("MANAGE_CURRICULUM");
  const s = t.samples;
  const [samples, subjects, grades] = await Promise.all([
    listSamples(),
    db.subject.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.grade.findMany({ where: { isActive: true }, orderBy: [{ stage: { sortOrder: "asc" } }, { sortOrder: "asc" }] }),
  ]);
  const labels: SampleLabels = { ...s, generic: L.errors.GENERIC ?? "Error" };
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={s.title}>
      <div className="space-y-4">
        <p className="text-sm leading-7 text-muted">{s.hint}</p>
        <SampleUpload subjects={subjects.map((x) => [x.code, pick(x)])} grades={grades.map((x) => [x.code, pick(x)])} t={labels} />
        {samples.length === 0 ? <p className="rounded-xl border border-line bg-surface p-6 text-center text-muted">{s.empty}</p> : (
          <div className="space-y-3">
            {samples.map((x) => <SampleCard key={`${x.id}:${x.updatedAt.getTime()}`} t={labels} s={{ id: x.id, title: x.title, subject: pick(x.subject), grade: x.grade ? pick(x.grade) : null, text: x.text, isActive: x.isActive, fileName: x.fileName }} />)}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
