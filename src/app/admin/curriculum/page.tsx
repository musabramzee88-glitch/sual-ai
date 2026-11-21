import Link from "next/link";
import { QUESTION_TYPES } from "@/lib/question-types";
import { Act, JsonForm } from "@/components/AdminActions";
import { AdminShell, Pill, TableWrap, Td, Th } from "@/components/AdminShell";
import { MultiCheckPatch } from "@/components/CurriculumEditors";
import { fmtDate } from "@/lib/i18n/admin";
import { adminCurriculumData, KINDS, type Kind } from "@/server/admin/curriculum";
import { adminCtx } from "@/server/admin/page";

const QTYPES: string[] = [...QUESTION_TYPES];
const FAMILIES = ["MATHEMATICS", "PHYSICS", "CHEMISTRY", "BIOLOGY", "GENERAL_SCIENCE", "ARABIC", "ENGLISH", "ISLAMIC", "SOCIAL_STUDIES", "COMPUTER", "OTHER_LANGUAGE", "OTHER"];

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab: Kind = (KINDS as string[]).includes(raw ?? "") ? (raw as Kind) : "stages";
  const { admin, site, t, L, pick } = await adminCtx("MANAGE_CURRICULUM");
  const c = t.cur;
  const d = await adminCurriculumData();
  const api = (id?: string) => `/api/v1/admin/curriculum/${tab}${id ? `/${id}` : ""}`;
  const gradeOpts: [string, string][] = d.grades.map((g) => [g.code, `${pick(g.stage)} — ${pick(g)}`]);

  /** أزرار مشتركة: إعادة تسمية، ترتيب، تفعيل/تعطيل */
  const common = (r: { id: string; isActive: boolean }) => (
    <div className="flex flex-wrap gap-1">
      <Act L={L} method="PATCH" url={api(r.id)} label={c.rename} ask={{ field: "nameAr", label: c.renameAr }} />
      <Act L={L} method="PATCH" url={api(r.id)} label={c.reorder} ask={{ field: "sortOrder", label: c.reorderAsk, number: true }} />
      <Act L={L} method="PATCH" url={api(r.id)} body={{ isActive: !r.isActive }} label={r.isActive ? c.disable : c.enable} tone={r.isActive ? "danger" : "ok"} confirmText />
    </div>
  );
  const nameCells = (r: { code: string; nameAr: string; nameEn: string; sortOrder: number; isActive: boolean }) => (
    <><Td><span dir="ltr">{r.code}</span></Td><Td>{r.nameAr}<div className="text-xs text-muted" dir="ltr">{r.nameEn}</div></Td><Td>{r.sortOrder}</Td><Td><Pill>{r.isActive ? t.common.yes : t.common.no}</Pill></Td></>
  );
  const head = (...extra: string[]) => <thead><tr><Th>{c.code}</Th><Th>{t.common.name}</Th><Th>{c.order}</Th><Th>{c.active}</Th>{extra.map((e) => <Th key={e}>{e}</Th>)}<Th>{t.common.actions}</Th></tr></thead>;
  const nameFields = [{ name: "code", label: c.code, dir: "ltr" as const }, { name: "nameAr", label: c.nameAr }, { name: "nameEn", label: c.nameEn }, { name: "sortOrder", label: c.order, type: "number" as const, required: false }];

  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={c.title}>
      <p className="mb-4 text-sm text-muted">{c.hint}</p>
      <nav className="mb-5 flex flex-wrap gap-1 border-b border-line pb-2">
        {KINDS.map((k) => <Link key={k} href={`/admin/curriculum?tab=${k}`} className={`rounded-lg px-3 py-1.5 text-sm ${k === tab ? "bg-brand text-white dark:text-paper" : "hover:bg-surface"}`}>{c.tabs[k]}</Link>)}
      </nav>

      {tab === "stages" && <>
        <TableWrap>{head()}<tbody>{d.stages.map((r) => <tr key={r.id}>{nameCells(r)}<Td>{common(r)}</Td></tr>)}</tbody></TableWrap>
        <h2 className="mb-3 mt-8 font-semibold">{t.common.create}</h2>
        <JsonForm L={L} url={api()} submit={t.common.create} fields={nameFields} />
      </>}

      {tab === "grades" && <>
        <TableWrap>{head(c.stage)}<tbody>{d.grades.map((r) => <tr key={r.id}>{nameCells(r)}<Td>{pick(r.stage)}</Td><Td>{common(r)}</Td></tr>)}</tbody></TableWrap>
        <h2 className="mb-3 mt-8 font-semibold">{t.common.create}</h2>
        <JsonForm L={L} url={api()} submit={t.common.create} fields={[...nameFields, { name: "stageCode", label: c.stage, type: "select", options: d.stages.map((s) => [s.code, pick(s)]) }]} />
      </>}

      {(tab === "tracks" || tab === "branches") && (() => {
        const rows = tab === "tracks" ? d.tracks : d.branches;
        return <>
          <TableWrap>{head(c.grades)}<tbody>{rows.map((r) => {
            const codes = r.grades.map((g) => g.grade.code);
            return <tr key={r.id}>{nameCells(r)}
              <Td><div className="flex max-w-xs flex-wrap gap-1">{codes.map((g) => <Pill key={g}>{gradeOpts.find(([k]) => k === g)?.[1] ?? g}</Pill>)}</div>
                <MultiCheckPatch L={L} url={api(r.id)} field="gradeCodes" options={gradeOpts} initial={codes} label={c.editGrades} /></Td>
              <Td>{common(r)}</Td></tr>;
          })}</tbody></TableWrap>
          <h2 className="mb-3 mt-8 font-semibold">{t.common.create}</h2>
          <JsonForm L={L} url={api()} submit={t.common.create}
            fields={tab === "tracks" ? [...nameFields, { name: "defaultLanguage", label: c.language, type: "select", options: [["AR", "العربية"], ["EN", "English"]] }] : nameFields}
            extra={{ name: "gradeCodes", label: c.grades, options: gradeOpts }} />
        </>;
      })()}

      {tab === "subjects" && <>
        <TableWrap>{head(c.family, c.qtypes)}<tbody>{d.subjects.map((r) => <tr key={r.id}>{nameCells(r)}
          <Td>{c.families[r.family]}{r.useLatinSymbols && <div className="text-xs text-muted">{c.latin}</div>}</Td>
          <Td><div className="flex max-w-sm flex-wrap gap-1">{r.questionTypes.map((q) => <Pill key={q}>{c.qt[q]}</Pill>)}</div>
            <MultiCheckPatch L={L} url={api(r.id)} field="questionTypes" options={QTYPES.map((q) => [q, c.qt[q]])} initial={r.questionTypes} label={c.editTypes} min={1} /></Td>
          <Td>{common(r)}<div className="mt-1"><Act L={L} method="PATCH" url={api(r.id)} body={{ useLatinSymbols: !r.useLatinSymbols }} label={c.latin} /></div></Td></tr>)}</tbody></TableWrap>
        <h2 className="mb-3 mt-8 font-semibold">{t.common.create}</h2>
        <JsonForm L={L} url={api()} submit={t.common.create} fields={[...nameFields, { name: "family", label: c.family, type: "select", options: FAMILIES.map((f) => [f, c.families[f]]) }]}
          extra={{ name: "questionTypes", label: c.qtypes, options: QTYPES.map((q) => [q, c.qt[q]]) }} />
      </>}

      {tab === "years" && <>
        <TableWrap><thead><tr><Th>{c.label}</Th><Th>{c.starts}</Th><Th>{c.ends}</Th><Th>{c.current}</Th><Th>{t.common.actions}</Th></tr></thead>
          <tbody>{d.years.length === 0 && <tr><Td>{c.empty}</Td></tr>}{d.years.map((y) => <tr key={y.id}><Td><span dir="ltr">{y.label}</span></Td><Td>{fmtDate(y.startsOn)}</Td><Td>{fmtDate(y.endsOn)}</Td><Td>{y.isCurrent && <Pill>{c.current}</Pill>}</Td>
            <Td>{!y.isCurrent && <Act L={L} method="PATCH" url={api(y.id)} body={{ isCurrent: true }} label={c.makeCurrent} confirmText />}</Td></tr>)}</tbody></TableWrap>
        <h2 className="mb-3 mt-8 font-semibold">{t.common.create}</h2>
        <JsonForm L={L} url={api()} submit={t.common.create} fields={[{ name: "label", label: c.label, dir: "ltr" }, { name: "startsOn", label: c.starts, type: "date" }, { name: "endsOn", label: c.ends, type: "date" }]} />
      </>}

      {tab === "curricula" && <>
        <TableWrap><thead><tr><Th>{c.ctitle}</Th><Th>{c.kind}</Th><Th>{c.grade}</Th><Th>{c.track}</Th><Th>{c.subject}</Th><Th>{c.year}</Th><Th>{c.chapters}</Th><Th>{c.active}</Th><Th>{t.common.actions}</Th></tr></thead>
          <tbody>{d.curricula.length === 0 && <tr><Td>{t.common.empty}</Td></tr>}{d.curricula.map((r) => <tr key={r.id}>
            <Td>{r.title}{r.edition && <div className="text-xs text-muted">{r.edition}</div>}<div className="text-xs text-muted">{r.language}</div></Td>
            <Td><Pill>{c.kinds[r.kind]}</Pill>{r.part > 0 && <div className="mt-1 text-xs text-muted">{c.parts[r.part]}</div>}</Td>
            <Td>{pick(r.grade)}{r.branch && <div className="text-xs text-muted">{pick(r.branch)}</div>}</Td><Td>{pick(r.track)}</Td><Td>{pick(r.subject)}</Td><Td><span dir="ltr">{r.academicYear.label}</span></Td>
            <Td>{r._count.chapters}</Td><Td><Pill>{r.isActive ? t.common.yes : t.common.no}</Pill></Td>
            <Td><div className="flex flex-wrap gap-1"><Link href={`/admin/curriculum/curricula/${r.id}`} className="rounded-lg border border-line px-3 py-1 text-xs">{c.editChapters}</Link>
              <Act L={L} method="PATCH" url={api(r.id)} label={c.rename} ask={{ field: "title", label: c.ctitle }} />
              <Act L={L} method="PATCH" url={api(r.id)} body={{ isActive: !r.isActive }} label={r.isActive ? c.disable : c.enable} tone={r.isActive ? "danger" : "ok"} confirmText /></div></Td>
          </tr>)}</tbody></TableWrap>
        <h2 className="mb-3 mt-8 font-semibold">{t.common.create}</h2>
        {d.years.length === 0 ? <p className="text-sm text-muted">{c.empty}</p> : (
          <JsonForm L={L} url={api()} submit={t.common.create} fields={[
            { name: "trackCode", label: c.track, type: "select", options: d.tracks.filter((x) => x.isActive).map((x) => [x.code, pick(x)]) },
            { name: "gradeCode", label: c.grade, type: "select", options: gradeOpts },
            { name: "branchCode", label: c.branch, type: "select", options: [["", c.noBranch], ...d.branches.map((b): [string, string] => [b.code, pick(b)])] },
            { name: "subjectCode", label: c.subject, type: "select", options: d.subjects.filter((x) => x.isActive).map((x) => [x.code, pick(x)]) },
            { name: "yearLabel", label: c.year, type: "select", options: d.years.map((y) => [y.label, y.label]) },
            { name: "language", label: c.language, type: "select", options: [["AR", "العربية"], ["EN", "English"]] },
            { name: "kind", label: c.kind, type: "select", options: Object.entries(c.kinds) },
            { name: "part", label: c.part, type: "select", numeric: true, options: c.parts.map((l, i): [string, string] => [String(i), l]) },
            { name: "title", label: c.ctitle }, { name: "edition", label: c.edition, required: false },
          ]} />
        )}
      </>}
    </AdminShell>
  );
}
