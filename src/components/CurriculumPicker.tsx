"use client";
import { useEffect, useId, useState } from "react";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";

export type PickerText = Pick<Dictionary["curricula"], "stage" | "grade" | "track" | "branch" | "choose" | "none" | "loading" | "error">;

type Item = { code: string; nameAr: string; nameEn: string };

async function fetchList(url: string, signal: AbortSignal): Promise<Item[]> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).data;
}

/** يجلب القوائم من الخادم: الصفوف دائماً مفلترة حسب المرحلة والمنهج المختارَين. */
function useList(url: string | null) {
  const [state, setState] = useState<{ url: string | null; items: Item[]; error: boolean }>({ url: null, items: [], error: false });
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    fetchList(url, ctrl.signal)
      .then((items) => setState({ url, items, error: false }))
      .catch((e) => !ctrl.signal.aborted && setState({ url, items: [], error: Boolean(e) }));
    return () => ctrl.abort();
  }, [url]);
  const loading = url !== null && state.url !== url;
  return { items: url && !loading ? state.items : [], loading, error: !loading && state.error };
}

export function CurriculumPicker({ t, locale, stages, tracks }: { t: PickerText; locale: Locale; stages: Item[]; tracks: Item[] }) {
  const [track, setTrack] = useState(tracks[0]?.code ?? "");
  const [stage, setStage] = useState("");
  const [grade, setGrade] = useState("");
  const [branch, setBranch] = useState("");

  const grades = useList(stage ? `/api/v1/curriculum/stages/${stage}/grades?track=${track}` : null);
  const branches = useList(grade ? `/api/v1/curriculum/grades/${grade}/branches` : null);
  const name = (i: Item) => (locale === "ar" ? i.nameAr : i.nameEn);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Select label={t.track} value={track} items={tracks} name={name} placeholder={t.choose}
        onChange={(v) => { setTrack(v); setGrade(""); setBranch(""); }} />
      <Select label={t.stage} value={stage} items={stages} name={name} placeholder={t.choose}
        onChange={(v) => { setStage(v); setGrade(""); setBranch(""); }} />
      <Select label={t.grade} value={grade} items={grades.items} name={name}
        placeholder={grades.loading ? t.loading : stage && !grades.items.length ? t.none : t.choose}
        disabled={!stage || grades.loading || !grades.items.length}
        onChange={(v) => { setGrade(v); setBranch(""); }} />
      <Select label={t.branch} value={branch} items={branches.items} name={name}
        placeholder={branches.loading ? t.loading : grade && !branches.items.length ? t.none : t.choose}
        disabled={!grade || branches.loading || !branches.items.length} onChange={setBranch} />
      {(grades.error || branches.error) && <p role="alert" className="text-sm text-danger sm:col-span-2">{t.error}</p>}
    </div>
  );
}

function Select({ label, value, items, name, placeholder, disabled, onChange }: {
  label: string; value: string; items: Item[]; name: (i: Item) => string; placeholder: string; disabled?: boolean; onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">{label}</label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl border border-line bg-surface px-3 text-ink transition focus:border-brand disabled:opacity-50">
        <option value="">{placeholder}</option>
        {items.map((i) => <option key={i.code} value={i.code}>{name(i)}</option>)}
      </select>
    </div>
  );
}
