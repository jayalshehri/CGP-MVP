"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import AccessibleDialog from "@/components/AccessibleDialog";
import { requireProfile } from "@/lib/auth";
import { formatRiyadhDate } from "@/lib/dates";
import { readStrategyRows } from "@/lib/strategy-read";
import { supabase } from "@/lib/supabase";
import s from "./register.module.css";

export type RecordTable = "assets" | "cyber_risks" | "vulnerabilities";
export type RecordRow = { id: number; updated_at: string };
export type AssetChoice = { id: number; name_ar: string; asset_code: string };
export const isManager = (role: string) => role === "admin" || role === "cybersecurity_team";
const cap = 30;

async function loadRows<T extends { id: number }>(table: string, columns: string) {
  const read = await readStrategyRows((a,b) => supabase.from(table).select(columns, { count: "exact" }).order("id").range(a,b), row => Number((row as unknown as {id: number}).id));
  if (read.status !== "COMPLETE") throw new Error("read_incomplete");
  return read.data as unknown as T[];
}

export function useRegister<T extends RecordRow>(table: RecordTable) {
  const [rows, setRows] = useState<T[]>([]);
  const [assets, setAssets] = useState<AssetChoice[]>([]);
  const [assetError, setAssetError] = useState(false);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const { profile } = await requireProfile(table === "assets" ? ["admin", "cybersecurity_team"] : undefined);
        const [snapshot, options] = await Promise.all([
          loadRows<T>(table, "*"),
          table !== "assets" && isManager(profile.role)
            ? loadRows<AssetChoice>("assets", "id,name_ar,asset_code").catch(() => null)
            : Promise.resolve([]),
        ]);
        if (live) { setRole(profile.role); setRows(snapshot); setAssets(options ?? []); setAssetError(options === null); setError(false); }
      } catch { if (live) { setError(true); setRows([]); } }
      finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; };
  }, [table, retry]);
  async function save(values: Record<string, unknown>, previous?: T) {
    await requireProfile(["admin", "cybersecurity_team"]);
    const write = previous
      ? supabase.from(table).update(values).eq("id", previous.id).eq("updated_at", previous.updated_at)
      : supabase.from(table).insert(values);
    const { data, error } = await write.select("*").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("register_conflict");
    const item = data as T;
    setRows(old => previous ? old.map(r => r.id === item.id ? item : r) : [...old, item]);
    return item;
  }
  const reload = () => { setLoading(true); setError(false); setRetry(v => v+1); };
  return { rows, assets, assetError, role, loading, error, reload, save, manage: isManager(role) };
}

export function errorMessage(e: unknown) {
  const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
  const message = e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String(e.message) : "";
  if (message === "register_conflict") return "عُدّل السجل في جلسة أخرى. حدّث الصفحة وافتحه مرة أخرى.";
  if (code === "23505") return "رمز السجل مستخدم. حدّث الصفحة وحاول مرة أخرى.";
  if (message.includes("risk_approval")) return "يتطلب تسجيل قرار القبول صلاحية مدير النظام ومرجع الاعتماد وتاريخ المراجعة.";
  if (message.includes("risk_closure")) return "أكمل خطة المعالجة والتقييم المتبقي ووثّق سبب القرار قبل الإغلاق.";
  if (message.includes("vuln_verification")) return "انقل الثغرة إلى «بانتظار التحقق»، ثم وثّق نتيجة التحقق قبل الإغلاق.";
  if (message.includes("vuln_exception")) return "أكمل مرجع اعتماد الاستثناء ومبرره وتاريخ انتهائه.";
  if (message.includes("vuln_scope")) return "اختر الأصل المتأثر أو اكتب نطاق التأثر.";
  if (message.includes("vuln_assessment")) return "راجع تاريخ الاكتشاف، وسجّل الاحتمالية والأثر معًا إن كان التقييم متاحًا.";
  if (message.includes("vuln_priority")) return "وثّق أساس تحديد أولوية المعالجة.";
  if (message.includes("vuln_hold")) return "أضف سبب التعليق وتاريخ انتهائه.";
  if (message.includes("vuln_assignment")) return "حدّد مسؤول المعالجة وموعدها قبل بدء العمل.";
  if (message.includes("risk_assessment")) return "أكمل متطلبات التقييم والسبب والأثر قبل حفظ الدرجة.";
  if (message.includes("status_transition")) return "الانتقال غير متاح من الحالة الحالية. حدّث السجل وحاول مرة أخرى.";
  return "تعذر حفظ السجل. راجع المدخلات وحاول مرة أخرى.";
}

export const ui = s;
export type QuickFilter<T> = { key: string; label: string; match: (row: T) => boolean };
export type RegisterFilter<T> = { label: string; options: [string, string][]; value: (row: T) => string };
export type RegisterColumn<T> = { label: string; view: (row: T) => ReactNode; mobile?: boolean };
type Props<T> = {
  title: string; description: string; rows: T[]; loading: boolean; error: boolean; reload: () => void;
  add?: { label: string; run: () => void }; secondary?: ReactNode; tools?: ReactNode; context?: ReactNode;
  quick: QuickFilter<T>[]; filters: RegisterFilter<T>[]; columns: RegisterColumn<T>[]; searchText: (row: T) => string;
  searchHint: string; initialQuick?: string; notice?: string; children?: ReactNode;
};

export function RegisterScreen<T extends RecordRow>(p: Props<T>) {
  const [quick, setQuick] = useState(p.initialQuick ?? "all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [page, setPage] = useState(0);
  const selected = p.quick.find(q => q.key === quick);
  const query = search.trim().toLocaleLowerCase();
  const filtered = p.rows.filter(r => (!selected || selected.match(r)) &&
    (!query || p.searchText(r).toLocaleLowerCase().includes(query)) &&
    p.filters.every((f, i) => !filters[i] || f.value(r) === filters[i]));
  const hasFilters = quick !== "all" || !!query || Object.values(filters).some(Boolean);
  const last = Math.max(0, Math.ceil(filtered.length / cap) - 1);
  const at = Math.min(page, last);
  const visible = filtered.slice(at * cap, at * cap + cap);
  const reset = () => { setQuick("all"); setFilters({}); setSearch(""); setPage(0); };
  return <main dir="rtl" className={s.page}>
    <header className={s.header}><div><span className={s.eyebrow}>العمليات</span><h1>{p.title}</h1><p>{p.description}</p></div>
      <div className={s.actions}>{p.secondary}{p.add && !p.loading && !p.error && <button className={s.primary} onClick={p.add.run} type="button">+ {p.add.label}</button>}</div>
    </header>
    {p.notice && <p role="status" className={s.success}>{p.notice}</p>}
    {p.context}
    {p.loading ? <p className={s.blank} role="status">جارٍ تحميل السجل…</p> : p.error
      ? <div className={s.blank} role="alert">تعذر تحميل السجل. <button className={s.secondary} onClick={p.reload}>إعادة المحاولة</button></div>
      : <>
        <div className={s.quick} role="group" aria-label="عروض السجل">
          <button className={s.chip} type="button" aria-pressed={quick === "all"} onClick={() => {setQuick("all");setPage(0);}}>الكل <b>{p.rows.length}</b></button>
          {p.quick.map(q => <button className={s.chip} key={q.key} type="button" aria-pressed={quick === q.key} onClick={() => {setQuick(q.key);setPage(0);}}>{q.label} <b>{p.rows.filter(q.match).length}</b></button>)}
        </div>
        <section className={s.panel} aria-label={p.title}>
          <div className={s.toolbar}><input type="search" aria-label="البحث في السجل" placeholder={p.searchHint} value={search} onChange={e => {setSearch(e.target.value);setPage(0);}} />{p.tools}</div>
          <details className={s.filters}><summary>الفلاتر{Object.values(filters).some(Boolean) ? ` · ${Object.values(filters).filter(Boolean).length}` : ""}</summary>
            <div className={s.fields}>{p.filters.map((f,i) => <label key={f.label}>{f.label}<select value={filters[i] ?? ""} onChange={e => {setFilters(old => ({...old,[i]:e.target.value}));setPage(0);}}><option value="">الكل</option>{f.options.map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></label>)}</div>
          </details>
          <div className={s.results}><span role="status">{filtered.length} من {p.rows.length} سجلات</span>{hasFilters && <button className={s.textButton} onClick={reset}>مسح التصفية</button>}</div>
          {visible.length === 0 ? <div className={s.blank}>{hasFilters ? "لا توجد سجلات تطابق خيارات البحث." : "لا توجد سجلات بعد."}</div>
            : <table className={s.table} role="table"><thead><tr>{p.columns.map(c => <th scope="col" key={c.label}>{c.label}</th>)}</tr></thead>
              <tbody>{visible.map(r => <tr role="row" key={r.id}>{p.columns.map((c,i) => <td role={i===0?"rowheader":"cell"} className={c.mobile === false ? s.desktop : undefined} key={c.label} data-label={c.label}>{c.view(r)}</td>)}</tr>)}</tbody>
            </table>}
          {last > 0 && <nav className={s.pagination} aria-label="صفحات السجل"><button className={s.secondary} disabled={at===0} onClick={() => setPage(at-1)}>السابق</button><span>{at+1} من {last+1}</span><button className={s.secondary} disabled={at===last} onClick={() => setPage(at+1)}>التالي</button></nav>}
        </section>
      </>}
    {p.children}
  </main>;
}

export function Drawer({ title, subtitle, busy, close, children }: { title: string; subtitle?: string; busy?: boolean; close: () => void; children: ReactNode }) {
  return <AccessibleDialog labelledBy="register-drawer-title" backdropClassName={s.backdrop} className={s.drawer} busy={busy} onClose={close}>
    <header className={s.drawerHead}><div><h2 id="register-drawer-title">{title}</h2>{subtitle && <bdi>{subtitle}</bdi>}</div><button type="button" className={s.secondary} aria-label="إغلاق" disabled={busy} onClick={close}>×</button></header>
    <div className={s.drawerBody}>{children}</div>
  </AccessibleDialog>;
}
export function Editor({ submit, busy, close, children, error, label = "حفظ" }: { submit: (data: FormData) => void; busy: boolean; close: () => void; children: ReactNode; error: string; label?: string }) {
  function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!busy) submit(new FormData(e.currentTarget));
  }
  return <form onSubmit={handle}>
    <fieldset className={s.editor} disabled={busy}>{children}</fieldset>
    {error && <p className={s.danger} role="alert">{error}</p>}
    <footer className={s.formActions}><button className={s.primary} disabled={busy}>{busy ? "جارٍ الحفظ…" : label}</button><button className={s.secondary} type="button" disabled={busy} onClick={close}>إلغاء</button></footer>
  </form>;
}

export function Input({ label, name, value, type = "text", required, maxLength = 300, min }: { label: string; name: string; value?: string | null; type?: "text" | "date" | "url"; required?: boolean; maxLength?: number; min?: string }) {
  return <label>{label}<input name={name} type={type} defaultValue={value ?? ""} required={required} maxLength={maxLength} min={min} dir={type === "date" || type === "url" ? "ltr" : "auto"} /></label>;
}
export function Area({ label, name, value, required }: { label: string; name: string; value?: string | null; required?: boolean }) {
  return <label className={s.wide}>{label}<textarea name={name} rows={3} maxLength={4000} defaultValue={value ?? ""} required={required} /></label>;
}
export function Select({ label, name, value, options, empty, required }: { label: string; name: string; value?: string | number | null; options: [string, string][]; empty?: string; required?: boolean }) {
  return <label>{label}<select name={name} defaultValue={String(value ?? "")} required={required}>
    {empty !== undefined && <option value="">{empty}</option>}{options.map(([k,v]) => <option key={k} value={k}>{v}</option>)}
  </select></label>;
}
export function Group({ label, children, open }: { label: string; children: ReactNode; open?: boolean }) {
  return <details className={s.group} open={open}><summary>{label}</summary><div className={s.fields}>{children}</div></details>;
}
export function Facts({ entries }: { entries: [string, ReactNode][] }) {
  return <dl className={s.facts}>{entries.map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v === null || v === "" || v === undefined ? "—" : v}</dd></div>)}</dl>;
}
export function Entry({ title, code, open }: { title: string; code: string; open: () => void }) {
  return <><button type="button" className={s.record} onClick={open}>{title}</button><bdi className={s.small}>{code}</bdi></>;
}
export function Badge({ value, tone = "neutral" }: { value: string; tone?: "neutral" | "good" | "warn" | "danger" | "info" }) {
  return <span className={`${s.badge} ${s[tone]}`}>{value}</span>;
}
export function DateCell({ value, late, label }: { value: string | null; late?: boolean; label?: string }) {
  return <span className={late ? s.late : undefined}>{value ? <time dateTime={value}>{formatRiyadhDate(value)}</time> : "غير محدد"}{(late || label) && <small className={s.small}>{late ? "متأخر" : label}</small>}</span>;
}
export const str = (data: FormData, field: string) => String(data.get(field) ?? "").trim();
export const nullable = (data: FormData, field: string) => str(data,field) || null;
export const number = (data: FormData, field: string) => str(data,field) ? Number(str(data,field)) : null;
export const opts = (labels: Record<string,string>): [string,string][] => Object.entries(labels);
export const optionsFrom = <T,>(rows: T[], field: (row: T) => string | null): [string,string][] =>
  [...new Set(rows.map(field).filter((name): name is string => !!name))].sort((a,b) => a.localeCompare(b, "ar")).map(v => [v,v]);
export const assetOptions = (rows: AssetChoice[]): [string,string][] =>
  [...rows].sort((a,b) => a.name_ar.localeCompare(b.name_ar, "ar")).map(a => [String(a.id), `${a.name_ar} · ${a.asset_code}`]);
