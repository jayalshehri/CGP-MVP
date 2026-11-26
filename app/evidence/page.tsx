"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AccessibleDialog from "@/components/AccessibleDialog";
import EvidenceDownload from "@/components/EvidenceDownload";
import GrcAttention from "@/components/GrcAttention";
import StatusBadge from "@/components/StatusBadge";
import { ResultSummary } from "@/components/WorkflowUI";
import { frameworkOf } from "@/lib/compliance";
import { getEccCatalogLabel } from "@/lib/ecc-catalog-labels";
import { isExpired } from "@/lib/grc";
import { supabase } from "@/lib/supabase";
import "./register.css";

type Control = { id: number; control_code: string; title_ar: string; control_owner_id: string | null; frameworks: unknown };
type Evidence = {
  link_id: number | null;
  version_number: number;
  valid_until: string | null;
  uploader_name: string | null;
  reviewer_display_name: string | null;
  is_current: boolean;
  id: number;
  control_id: number;
  evidence_name: string | null;
  description: string | null;
  file_name: string | null;
  file_path: string | null;
  status: string | null;
  uploaded_at: string | null;
  reviewed_at: string | null;
};
type EvidenceRow = Evidence & { control: Control; framework: string; controlTitle: string; searchText: string };
type EvidenceScope = "current" | "all";

const quickFilters = [
  { key: "all", label: "الكل", tone: "neutral" },
  { key: "changes_requested", label: "يحتاج استكمالًا", tone: "warning" },
  { key: "review", label: "للمراجعة", tone: "info" },
  { key: "accepted", label: "مقبول", tone: "success" },
  { key: "rejected", label: "مرفوض", tone: "danger" },
] as const;
const statuses = [
  { value: "all", label: "كل الحالات" },
  { value: "review", label: "بانتظار المراجعة أو قيدها" },
  { value: "pending_review", label: "بانتظار المراجعة" },
  { value: "under_review", label: "قيد المراجعة" },
  { value: "changes_requested", label: "يحتاج استكمالًا" },
  { value: "accepted", label: "مقبول" },
  { value: "rejected", label: "مرفوض" },
];
const reviewStatuses = new Set(["pending_review", "under_review"]);
const normalizeSearch = (text: string) => text.toLowerCase().trim()
  .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
  .replace(/[‐-―−]/g, "-");
const evidenceTitle = (row: Evidence) => row.evidence_name?.trim() || row.file_name?.trim() || `دليل ${row.id}`;
const rowKey = (row: Evidence) => `${row.id}-${row.link_id ?? "source"}`;
const ip = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" });
function formatEvidenceDate(value: string | null) {
  const time = parseDate(value);
  return time ? ip.format(time) : "غير محدد";
}
function parseDate(value: string | null) {
  if (!value) return 0;
  const timestamp = Date.parse(value.length === 10 ? `${value}T12:00:00+03:00` : value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
function matchesStatus(row: Evidence, target: string) {
  const value = row.status ?? "";
  return target === "all" || (target === "review" ? reviewStatuses.has(value) : target === value);
}
function controlDisplayTitle(control: Control, framework: string) {
  return (framework === "ECC" ? getEccCatalogLabel(control.control_code) : undefined)
    || control.title_ar.replace(/\s*[-–]\s*[\d-]+\s*$/, "").trim()
    || "الضابط المرتبط";
}

export default function EvidencePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [scope, setScope] = useState<EvidenceScope>("current");
  const [framework, setFramework] = useState("all");
  const [selected, setSelected] = useState<EvidenceRow | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!live) return;
        if (!session) { router.replace("/login"); return; }
        const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("user_id", session.user.id).maybeSingle();
        if (!live) return;
        if (!profile || profile.is_active === false) { setError("تعذر التحقق من صلاحية المستخدم."); return; }
        const userRole = profile.role || "control_owner";
        setRole(userRole);

        let controlQuery = supabase.from("controls").select("id,control_code,title_ar,control_owner_id,frameworks!inner(code,name_ar,is_active)").eq("frameworks.is_active", true).order("id");
        if (userRole === "control_owner") controlQuery = controlQuery.eq("control_owner_id", session.user.id);
        const { data: controlData, error: controlError } = await controlQuery;
        if (!live) return;
        if (controlError) { setError("تعذر تحميل الضوابط المرتبطة بالأدلة."); return; }
        const controls = (controlData ?? []) as Control[];
        if (!controls.length) return;

        const { data: evidenceData, error: evidenceError } = await supabase.rpc("grc_evidence_register");
        if (!live) return;
        if (evidenceError) { setError("تعذر تحميل سجل الأدلة."); return; }
        const controlById = new Map(controls.map(c => [c.id, c]));
        const entries = ((evidenceData ?? []) as Evidence[]).flatMap(item => {
          const control = controlById.get(item.control_id);
          if (!control) return [];
          const code = frameworkOf(control.frameworks).code;
          const title = controlDisplayTitle(control, code);
          const searchText = normalizeSearch(`${evidenceTitle(item)} ${item.file_name ?? ""} ${control.control_code} ${title} ${control.title_ar} ${code}`);
          return [{ ...item, control, framework: code, controlTitle: title, searchText }];
        });
        entries.sort((a, b) => parseDate(b.uploaded_at) - parseDate(a.uploaded_at) || b.id - a.id || (a.link_id ?? 0) - (b.link_id ?? 0));
        setRows(entries);
      } catch { if (live) setError("تعذر تحميل سجل الأدلة."); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [router]);

  const availableFrameworks = useMemo(() => [...new Set(rows.map(row => row.framework))].filter(code => code !== "—").sort(), [rows]);
  const scoped = useMemo(() => rows.filter(row => (scope === "all" || row.is_current) && (framework === "all" || row.framework === framework)), [rows, scope, framework]);
  const q = normalizeSearch(search);
  const filtered = scoped.filter(row => (!q || row.searchText.includes(q)) && matchesStatus(row, status));
  const filtering = !!q || status !== "all" || framework !== "all";
  function clearFilters() { setSearch(""); setStatus("all"); setFramework("all"); }
  function showAllStatuses() { setSearch(""); setStatus("all"); }

  if (loading) return <main className="workflow-page evidence-page" dir="rtl" role="status">جاري تحميل سجل الأدلة…</main>;
  if (error) return <main className="workflow-page evidence-page" dir="rtl"><h1>تعذر تحميل الأدلة</h1><p role="alert">{error}</p>
    <button type="button" className="evidence-button" onClick={() => window.location.reload()}>إعادة المحاولة</button></main>;

  return <main className="workflow-page evidence-page" dir="rtl">
    <header className="evidence-header">
      <div><h1>الأدلة</h1><p>اعثر على الدليل، وتابع حالته والضابط المرتبط به.</p></div>
      <Link className="evidence-button" href="/controls">اختيار ضابط لرفع دليل <span aria-hidden="true">←</span></Link>
    </header>

    {role !== "nca_external_auditor" && <GrcAttention variant="summary"/>}

    <section className="evidence-toolbar" aria-label="نطاق سجل الأدلة وتصفيته">
      <label className="evidence-field evidence-search">
        <span>البحث في الأدلة</span>
        <input type="search" dir="auto" value={search} onChange={e => setSearch(e.target.value)} placeholder="اسم الدليل أو رقم الضابط"/>
      </label>
      <label className="evidence-field">
        <span>الإطار التنظيمي</span>
        <select value={framework} onChange={e => setFramework(e.target.value)}>
          <option value="all">جميع الأطر</option>{availableFrameworks.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
      </label>
      <label className="evidence-field">
        <span>حالة المراجعة</span>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          {statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <div className="evidence-scope" role="group" aria-label="نطاق الإصدارات">
        <button type="button" aria-pressed={scope === "current"} onClick={() => setScope("current")}>الحالية</button>
        <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>كل الإصدارات</button>
      </div>
    </section>

    <section className="evidence-results" aria-label="سجل الأدلة">
      <div className="evidence-results-bar">
        <div className="evidence-quick" role="group" aria-label="فلاتر الأدلة السريعة وأعدادها ضمن النطاق">
          {quickFilters.map(item => {
            const count = scoped.filter(row => matchesStatus(row, item.key)).length;
            return <button type="button" key={item.key} aria-pressed={status === item.key && (item.key !== "all" || !q)}
              onClick={() => item.key === "all" ? showAllStatuses() : setStatus(status === item.key ? "all" : item.key)}>
              {item.label} <span data-tone={count ? item.tone : "neutral"}>{count}</span>
            </button>;
          })}
        </div>
        <ResultSummary count={filtered.length} total={scoped.length} active={filtering} reset={clearFilters}/>
      </div>

      {filtered.length ? <table className="evidence-table" aria-label="قائمة الأدلة" role="table">
        <colgroup><col/><col className="evidence-control-col"/><col className="evidence-status-col"/><col className="evidence-date-col"/></colgroup>
        <thead role="rowgroup"><tr role="row">
          <th scope="col" role="columnheader">الدليل</th><th scope="col" role="columnheader">الضابط المرتبط</th>
          <th scope="col" role="columnheader">حالة المراجعة</th><th scope="col" role="columnheader">تاريخ الرفع</th>
        </tr></thead>
        <tbody role="rowgroup">{filtered.map(row => <tr role="row" key={rowKey(row)}>
          <th scope="row" role="rowheader">
            <button className="evidence-row-trigger" type="button" aria-haspopup="dialog" onClick={() => setSelected(row)}>
              <bdi dir="auto" title={evidenceTitle(row)}>{evidenceTitle(row)}</bdi>
              {!row.is_current && <small>إصدار سابق</small>}
            </button>
          </th>
          <td role="cell"><div className="evidence-control-line">
            <bdi dir="ltr" className="evidence-control-code">{row.framework} · {row.control.control_code}</bdi>
            <span title={row.controlTitle}>{row.controlTitle}</span>
          </div></td>
          <td role="cell"><StatusBadge status={row.status ?? ""}/></td>
          <td role="cell"><span className="evidence-mobile-label" aria-hidden="true">تاريخ الرفع</span>
            <bdi className="evidence-date">{formatEvidenceDate(row.uploaded_at)}</bdi>
          </td>
        </tr>)}</tbody>
      </table> : <div className="evidence-empty">
        <div><h2>{!rows.length ? "لا توجد أدلة مرفوعة ضمن نطاقك" : q ? "لا توجد نتائج مطابقة للبحث" : "لا توجد أدلة مطابقة للنطاق الحالي"}</h2>
          <p>{!rows.length ? "تظهر الأدلة هنا بعد رفعها على أحد الضوابط المتاحة لك." : q ? "جرّب اسمًا آخر أو ابحث برقم الضابط." : "غيّر الفلاتر أو اعرض كل الإصدارات."}</p></div>
        {filtering ? <button type="button" className="evidence-button" onClick={q ? () => setSearch("") : clearFilters}>{q ? "مسح البحث" : "إزالة التصفية"}</button> : null}
      </div>}
    </section>

    {selected && <EvidenceDrawer key={rowKey(selected)} row={selected} canReview={["admin", "cybersecurity_team"].includes(role)} onClose={() => setSelected(null)}/>}
  </main>;
}

function EvidenceDrawer({ row, canReview, onClose }: { row: EvidenceRow; canReview: boolean; onClose: () => void }) {
  const title = evidenceTitle(row);
  const expired = isExpired(row.valid_until);
  return <AccessibleDialog labelledBy="evidence-drawer-title" backdropClassName="evidence-drawer-shell" className="evidence-drawer" onClose={onClose}>
    <header>
      <bdi dir="ltr" className="evidence-control-code">{row.framework} · {row.control.control_code}</bdi>
      <button type="button" className="evidence-drawer-close" aria-label="إغلاق تفاصيل الدليل" onClick={onClose}>×</button>
      <h2 id="evidence-drawer-title"><bdi dir="auto">{title}</bdi></h2>
      <p>{row.controlTitle}</p>
    </header>
    <div className="evidence-drawer-body">
      <dl className="evidence-facts">
        <div><dt>حالة المراجعة</dt><dd><StatusBadge status={row.status ?? ""}/></dd></div>
        <div><dt>الإصدار</dt><dd>{row.version_number} · {row.is_current ? "الحالي" : "السابق"}{row.link_id ? " · دليل مشترك" : ""}</dd></div>
        <div><dt>رفع بواسطة</dt><dd><bdi>{row.uploader_name || "رافع غير موثق بالاسم"}</bdi></dd></div>
        <div><dt>تاريخ الرفع</dt><dd><bdi>{formatEvidenceDate(row.uploaded_at)}</bdi></dd></div>
        <div><dt>تاريخ انتهاء الصلاحية</dt><dd><bdi>{formatEvidenceDate(row.valid_until)}</bdi>{expired && <span className="evidence-expired">منتهي الصلاحية</span>}</dd></div>
        {row.reviewed_at && <div><dt>تاريخ آخر مراجعة</dt><dd><bdi>{formatEvidenceDate(row.reviewed_at)}</bdi>{row.reviewer_display_name && <> · <bdi>{row.reviewer_display_name}</bdi></>}</dd></div>}
      </dl>
      {row.file_name && row.file_name !== title && <section><h3>اسم الملف</h3><p><bdi dir="auto">{row.file_name}</bdi></p></section>}
      {row.description && <section><h3>وصف الدليل</h3><p dir="auto">{row.description}</p></section>}
    </div>
    <footer>
      <EvidenceDownload path={row.file_path} name={row.file_name}/>
      <Link className="evidence-button" href={`/controls/${row.control_id}`}>فتح الضابط <span aria-hidden="true">←</span></Link>
      {canReview && row.is_current && reviewStatuses.has(row.status ?? "") &&
        <Link className="evidence-button evidence-review-link" href={`/review#evidence-${row.id}`}>فتح في مراجعة الأدلة</Link>}
    </footer>
  </AccessibleDialog>;
}
