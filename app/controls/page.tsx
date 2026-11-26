"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { ResultSummary } from "@/components/WorkflowUI";
import { requireProfile } from "@/lib/auth";
import { getEccOfficialTitle } from "@/lib/ecc-strategy-example";
import { supabase } from "@/lib/supabase";
import "./catalog.css";

type Control = {
  id: number;
  framework_id: number;
  control_code: string;
  title_ar: string;
  description_ar: string | null;
  official_text_ar: string | null;
  hierarchy_level: string;
  parent_control_id: number | null;
  applicability: string | null;
  domain_ar: string;
  implementation_status: string;
  evidence_status: string;
  verification_status: string;
  due_date: string | null;
  control_owner: string | null;
  control_owner_id: string | null;
};
type Framework = { id: number; code: string; name_ar: string; version: string };
type EvidencePreview = {
  id: number;
  control_id: number;
  link_id: number | null;
  evidence_name: string | null;
  file_name: string | null;
  status: string | null;
  is_current: boolean;
  uploaded_at: string | null;
};
type View = "structure" | "followup";

const good = (value: string) => ["implemented", "compliant"].includes(value);
const needsEvidence = (control: Control) => control.implementation_status !== "not_applicable"
  && !["uploaded", "pending_review", "under_review", "accepted", "approved", "verified"].includes(control.evidence_status);
const cleanTitle = (value: string) => value.replace(/\s*[-–]\s*[\d-]+\s*$/, "").trim();
// Match canonical LTR codes, including Arabic/Indic digits and copied dashes.
const normalize = (value: string) => value
  .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
  .replace(/[‐-―−]/g, "-").toLowerCase().trim();
const byCode = (a: Control, b: Control) => a.control_code.localeCompare(b.control_code, "en", { numeric: true });
const applicabilityLabel = (value: string | null) => value === "CSP" ? "مقدم الخدمة CSP" : value === "CST" ? "المشترك CST" : null;
const shortLabel = (control: Control, framework: string) =>
  (framework === "ECC" ? getEccOfficialTitle(control.control_code) : undefined)
  || control.official_text_ar || control.description_ar || cleanTitle(control.title_ar) || "ضابط بدون عنوان";

const riyadhDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
function dueAttention(control: Control, today: string, soon: string) {
  if (!control.due_date || control.implementation_status === "not_applicable"
      || (good(control.implementation_status) && ["verified", "approved"].includes(control.verification_status))) return null;
  if (control.due_date < today) return "متأخر";
  return control.due_date <= soon ? "يستحق قريبًا" : null;
}

export default function ControlsPage() {
  return <Suspense fallback={<main className="workflow-page" dir="rtl" role="status">جاري تحميل الضوابط…</main>}><ControlsContent/></Suspense>;
}

function ControlsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedFramework = params.get("framework") || "ECC";
  const requestedDomain = params.get("domain") || "";
  const rawStatus = params.get("status") || "all";
  const status = ["all", "implemented", "in_progress", "not_started", "not_applicable"].includes(rawStatus) ? rawStatus : "all";
  const rawAssignment = params.get("assignment") || "all";
  const assignment = ["all", "assigned", "unassigned"].includes(rawAssignment) ? rawAssignment : "all";
  const evidenceFilter = params.get("evidence") === "needed";
  const overdueFilter = params.get("due") === "overdue";
  const view: View = params.get("view") === "structure" ? "structure" : "followup";

  const [search, setSearch] = useState("");
  const [cloudScope, setCloudScope] = useState("all");
  const [controls, setControls] = useState<Control[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedControl, setSelectedControl] = useState<Control | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { user, profile } = await requireProfile();
        if (!active) return;
        setCanManage(profile.role === "admin" || profile.role === "cybersecurity_team");
        let query = supabase.from("controls").select("id,framework_id,control_code,title_ar,description_ar,official_text_ar,hierarchy_level,parent_control_id,applicability,domain_ar,implementation_status,evidence_status,verification_status,due_date,control_owner,control_owner_id").order("id");
        if (profile.role === "control_owner") query = query.eq("control_owner_id", user.id);
        const [{ data, error }, { data: frameworkData, error: frameworkError }] = await Promise.all([
          query, supabase.from("frameworks").select("id,code,name_ar,version").eq("is_active", true).order("id"),
        ]);
        if (error || frameworkError) throw error || frameworkError;
        if (active) { setControls((data ?? []) as Control[]); setFrameworks((frameworkData ?? []) as Framework[]); }
      } catch (e) {
        if (active) setError(new Error(e instanceof Error ? e.message : "تعذر تحميل الضوابط"));
        const { data } = await supabase.auth.getSession();
        if (active && !data.session) router.replace("/login");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [router]);

  const selectedFramework = frameworks.find(item => item.code === requestedFramework) ?? frameworks.find(item => item.code === "ECC") ?? frameworks[0];
  const framework = selectedFramework?.code ?? "";
  const scoped = useMemo(() => controls.filter(c => c.framework_id === selectedFramework?.id &&
    (framework !== "CCC" || cloudScope === "all" || c.control_code.includes(cloudScope === "provider" ? "-P-" : "-T-"))),
    [controls, selectedFramework, framework, cloudScope]);
  const domains = useMemo(() => Map.groupBy(scoped, c => c.domain_ar || "غير مصنف"), [scoped]);
  const domain = domains.has(requestedDomain) ? requestedDomain : [...domains.keys()][0] ?? "";
  const domainControls = domains.get(domain) ?? [];
  const today = riyadhDate.format(new Date());
  const nextWeek = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const isOverdue = (control: Control) => dueAttention(control, today, nextWeek) === "متأخر";
  // Counters describe the selected scope, not the subset after search/filtering.
  const quickCounts = {
    all: domainControls.length,
    evidence: domainControls.filter(needsEvidence).length,
    unassigned: domainControls.filter(control => !control.control_owner_id).length,
    overdue: domainControls.filter(isOverdue).length,
  };
  const query = normalize(search);
  const filtered = domainControls.filter(c => {
    const searchMatch = normalize(`${c.control_code} ${c.title_ar} ${c.official_text_ar ?? ""} ${framework} ${c.control_owner ?? ""}`).includes(query);
    const statusMatch = status === "all" || (status === "implemented" ? good(c.implementation_status) : c.implementation_status === status);
    const assignmentMatch = assignment === "all" || (assignment === "assigned" ? !!c.control_owner_id : !c.control_owner_id);
    return searchMatch && statusMatch && assignmentMatch
      && (!evidenceFilter || needsEvidence(c)) && (!overdueFilter || isOverdue(c));
  }).sort(byCode);
  const filtering = !!search.trim() || status !== "all" || assignment !== "all" || evidenceFilter || overdueFilter;
  const primaryCount = scoped.filter(c => c.hierarchy_level !== "sub_control").length;

  function updateParams(values: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(next.size ? `/controls?${next.toString()}` : "/controls", { scroll: false });
  }

  function clearFilters() {
    setSearch("");
    updateParams({ status: null, assignment: null, evidence: null, due: null });
  }

  if (loading) return <main className="workflow-page" dir="rtl" role="status">جاري تحميل الضوابط…</main>;
  if (error) return <main className="workflow-page" dir="rtl"><h1>تعذر تحميل الضوابط</h1><p className="catalog-error">{error.message}</p><Link href="/cybersecurity">العودة إلى لوحة المتابعة</Link></main>;

  return <main className="workflow-page catalog-page" dir="rtl">
    <header className="catalog-header">
      <div>
        <h1>الضوابط</h1>
        <p>تابع حالة التنفيذ والأدلة حسب الإطار والمجال.</p>
      </div>
      <div className="catalog-header-actions">
        <div className="catalog-views" role="group" aria-label="طريقة العرض">
          <button type="button" aria-pressed={view === "followup"} onClick={() => updateParams({ view: null })}>المتابعة</button>
          <button type="button" aria-pressed={view === "structure"} onClick={() => updateParams({ view: "structure" })}>عرض الهيكل</button>
        </div>
        {canManage && <details className="catalog-menu">
          <summary>الإجراءات</summary>
          <div className="catalog-menu-panel catalog-actions-panel">
            <Link href="/controls/bulk-assign">تعيين المالكين جماعيًا</Link>
          </div>
        </details>}
      </div>
    </header>

    {!selectedFramework ? <p className="catalog-empty" role="status">لا توجد أطر تنظيمية متاحة ضمن نطاقك.</p> : <>
      <section className="catalog-scope" aria-label="نطاق الضوابط وتصفية القائمة">
        <div className="catalog-toolbar">
          <label className="catalog-field"><span>الإطار</span>
            <select value={framework} onChange={e => {
              setSearch(""); setCloudScope("all");
              updateParams({ framework: e.target.value, domain: null, status: null, assignment: null, evidence: null, due: null });
            }}>
              {frameworks.map(f => <option key={f.id} value={f.code}>{f.code}</option>)}
            </select>
          </label>
          {framework === "CCC" && <label className="catalog-field"><span>نطاق الحوسبة السحابية</span>
            <select value={cloudScope} onChange={e => { setCloudScope(e.target.value); updateParams({ domain: null }); }}>
              <option value="all">الكل</option><option value="provider">مقدم الخدمة CSP</option><option value="tenant">المشترك CST</option>
            </select>
          </label>}
          <label className="catalog-field catalog-domain"><span>المجال</span>
            <select value={domain} disabled={!domains.size} onChange={e => updateParams({ domain: e.target.value })}>
              {!domains.size && <option value="">لا توجد مجالات</option>}
              {[...domains.keys()].map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="catalog-field catalog-search"><span>البحث داخل المجال</span>
            <input type="search" dir="auto" value={search} onChange={e => setSearch(e.target.value)} placeholder="رقم الضابط أو النص أو المالك"/>
          </label>
          <details className="catalog-menu catalog-filter">
            <summary>التصفية{(status !== "all" || assignment !== "all") && <span className="catalog-filter-dot" aria-label="تصفية نشطة"/>}</summary>
            <div className="catalog-menu-panel catalog-filter-panel">
              <label className="catalog-field"><span>حالة التنفيذ</span>
                <select value={status} onChange={e => updateParams({ status: e.target.value === "all" ? null : e.target.value })}>
                  <option value="all">كل الحالات</option><option value="implemented">مطبق كليًا</option><option value="in_progress">مطبق جزئيًا</option><option value="not_started">غير مطبق</option><option value="not_applicable">لا ينطبق</option>
                </select>
              </label>
              <label className="catalog-field"><span>الإسناد</span>
                <select value={assignment} onChange={e => updateParams({ assignment: e.target.value === "all" ? null : e.target.value })}>
                  <option value="all">الكل</option><option value="assigned">معيّن</option><option value="unassigned">غير معيّن</option>
                </select>
              </label>
            </div>
          </details>
        </div>
        <div className="catalog-scope-note">
          <span>{selectedFramework.name_ar}{selectedFramework.version && <> · إصدار <bdi>{selectedFramework.version}</bdi></>}</span>
          <span><strong>{primaryCount}</strong> ضابط أساسي <span aria-hidden="true">·</span> <strong>{scoped.length - primaryCount}</strong> بند فرعي</span>
        </div>
      </section>

      <section className="catalog-results" aria-label="نتائج الضوابط">
        <div className="catalog-results-bar">
          <div className="catalog-quick-filters" role="group" aria-label="فلاتر المتابعة السريعة وأعداد الضوابط ضمن المجال">
            <button type="button" aria-pressed={!filtering} onClick={clearFilters}>
              الكل <span className="catalog-quick-count">{quickCounts.all}</span>
            </button>
            <button type="button" aria-pressed={evidenceFilter} onClick={() => updateParams({ evidence: evidenceFilter ? null : "needed" })}>
              يحتاج دليلًا <span className={`catalog-quick-count ${quickCounts.evidence ? "is-attention" : ""}`}>{quickCounts.evidence}</span>
            </button>
            <button type="button" aria-pressed={assignment === "unassigned"} onClick={() => updateParams({ assignment: assignment === "unassigned" ? null : "unassigned" })}>
              بلا مالك <span className="catalog-quick-count">{quickCounts.unassigned}</span>
            </button>
            <button type="button" aria-pressed={overdueFilter} onClick={() => updateParams({ due: overdueFilter ? null : "overdue" })}>
              متأخر <span className={`catalog-quick-count ${quickCounts.overdue ? "is-overdue" : ""}`}>{quickCounts.overdue}</span>
            </button>
          </div>
          <ResultSummary count={filtered.length} total={domainControls.length} active={filtering} reset={clearFilters}/>
        </div>
        {!filtered.length ? <p className="catalog-empty">لا توجد ضوابط مطابقة داخل هذا المجال.</p>
        : view === "structure" ? <StructureList rows={filtered} domainControls={domainControls} framework={framework} filtering={filtering}/>
        : <table className="catalog-table" aria-label="متابعة الضوابط" role="table">
          <colgroup><col/><col className="catalog-owner-col"/><col className="catalog-status-col"/><col className="catalog-status-col"/></colgroup>
          <thead role="rowgroup"><tr role="row">
            <th scope="col" role="columnheader">الضابط</th><th scope="col" role="columnheader">المالك</th><th scope="col" role="columnheader">التنفيذ</th><th scope="col" role="columnheader">الدليل</th>
          </tr></thead>
          <tbody role="rowgroup">{filtered.map(control => {
            const label = shortLabel(control, framework);
            const attention = dueAttention(control, today, nextWeek);
            return <tr key={control.id} role="row">
              <th scope="row" role="rowheader">
                <Link className="catalog-control-link" href={`/controls/${control.id}`} prefetch={false} onNavigate={event => {
                  if (!window.matchMedia("(min-width: 761px)").matches) return;
                  event.preventDefault(); setSelectedControl(control);
                }}>
                  <span className="catalog-control-line">
                    <bdi className="catalog-code" dir="ltr">{control.control_code}</bdi>
                    <span className="catalog-control-label" title={label}>{label}</span>
                  </span>
                  {attention && <span className={`catalog-deadline ${attention === "متأخر" ? "is-overdue" : ""}`}>{attention}</span>}
                </Link>
              </th>
              <td role="cell"><span className="catalog-mobile-label" aria-hidden="true">المالك</span><bdi className="catalog-owner" title={control.control_owner ?? undefined}>{control.control_owner || "غير معيّن"}</bdi></td>
              <td role="cell"><span className="catalog-mobile-label" aria-hidden="true">التنفيذ</span><StatusBadge status={control.implementation_status}/></td>
              <td role="cell"><span className="catalog-mobile-label" aria-hidden="true">الدليل</span><StatusBadge status={control.evidence_status}/></td>
            </tr>;
          })}</tbody>
        </table>}
      </section>
      {selectedControl && <ControlDrawer key={selectedControl.id} control={selectedControl} framework={selectedFramework} onClose={() => setSelectedControl(null)}/>}
    </>}
  </main>;
}

function StructureList({ rows, domainControls, framework, filtering }: { rows: Control[]; domainControls: Control[]; framework: string; filtering: boolean }) {
  // Keep a matching child reachable even when the search excludes its parent.
  const shown = new Set(rows.map(row => row.id));
  const parents = new Set(rows.flatMap(row => row.parent_control_id == null ? [] : [row.parent_control_id]));
  const withParents = [...rows, ...domainControls.filter(row => parents.has(row.id) && !shown.has(row.id))].sort(byCode);
  const groups = Map.groupBy(withParents, row => row.control_code.split("-").slice(0, 2).join("-"));
  function item(row: Control) {
    const applicability = applicabilityLabel(row.applicability);
    return <Link className="catalog-structure-link" href={`/controls/${row.id}`} prefetch={false}>
      <bdi className="catalog-code" dir="ltr">{row.control_code}</bdi><span>{shortLabel(row, framework)}</span>
      {applicability && <small>{applicability}</small>}<StatusBadge status={row.implementation_status}/>
    </Link>;
  }
  return <div className="catalog-structure">{[...groups].map(([code, group], index) => {
    const groupIds = new Set(group.map(row => row.id));
    const roots = group.filter(row => row.hierarchy_level !== "sub_control" || !groupIds.has(row.parent_control_id ?? -1));
    const byParent = Map.groupBy(group.filter(row => row.hierarchy_level === "sub_control"), row => row.parent_control_id);
    return <details key={code} open={filtering || index === 0}>
      <summary><bdi className="catalog-code" dir="ltr">{code}</bdi> <strong>{cleanTitle(group[0].title_ar)}</strong></summary>
      <ul>{roots.map(row => <li key={row.id}>{item(row)}
        {!!byParent.get(row.id)?.length && <ul>{byParent.get(row.id)?.map(child => <li key={child.id}>{item(child)}</li>)}</ul>}
      </li>)}</ul>
    </details>;
  })}</div>;
}

function ControlDrawer({ control, framework, onClose }: { control: Control; framework: Framework; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [evidence, setEvidence] = useState<EvidencePreview[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // Use the same RLS-filtered register as the full control detail page.
        // The deployed RPC works without PostgREST projection and ordering on its result.
        const { data, error } = await supabase.rpc("grc_evidence_register");
        if (error) throw error;
        const current = ((data ?? []) as EvidencePreview[])
          .filter(item => item.control_id === control.id && item.is_current)
          .sort((a, b) => (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""))
          .slice(0, 4);
        if (active) setEvidence(current);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => { active = false; };
  }, [control.id]);

  const applicability = applicabilityLabel(control.applicability);
  return <dialog className="catalog-drawer" dir="rtl" ref={dialogRef} aria-labelledby="catalog-drawer-title" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
    <article>
      <header className="catalog-drawer-header">
        <div className="catalog-drawer-meta"><bdi className="catalog-code" dir="ltr">{control.control_code}</bdi><bdi>{framework.code}</bdi> <span>{control.hierarchy_level === "sub_control" ? "بند فرعي" : "ضابط أساسي"}</span></div>
        <button className="catalog-close" type="button" autoFocus aria-label="إغلاق تفاصيل الضابط" onClick={() => dialogRef.current?.close()}>×</button>
        <h2 id="catalog-drawer-title">{(framework.code === "ECC" ? getEccOfficialTitle(control.control_code) : undefined) || cleanTitle(control.title_ar) || "تفاصيل الضابط"}</h2>
        <p>{control.domain_ar}{applicability && ` · ${applicability}`}</p>
      </header>
      <div className="catalog-drawer-body">
        <dl className="catalog-drawer-facts">
          <div><dt>المالك</dt><dd><bdi>{control.control_owner || "غير معيّن"}</bdi></dd></div>
          <div><dt>تاريخ الاستحقاق</dt><dd>{control.due_date ? <bdi dir="ltr">{control.due_date}</bdi> : "غير محدد"}</dd></div>
          <div><dt>حالة التنفيذ</dt><dd><StatusBadge status={control.implementation_status}/></dd></div>
          <div><dt>حالة الدليل</dt><dd><StatusBadge status={control.evidence_status}/></dd></div>
        </dl>
        <section aria-labelledby="catalog-requirement-title">
          <h3 id="catalog-requirement-title">{control.official_text_ar ? "النص الرسمي للضابط" : "الوصف المسجل"}</h3>
          <p className="catalog-requirement">{control.official_text_ar || control.description_ar || "لا يوجد نص مسجل لهذا الضابط."}</p>
        </section>
        <section aria-labelledby="catalog-evidence-title" aria-busy={evidence === null && !failed}>
          <h3 id="catalog-evidence-title">الأدلة المرفوعة الحالية</h3>
          {failed ? <p role="status">تعذر تحميل ملخص الأدلة. افتح صفحة الضابط للمحاولة مرة أخرى.</p>
          : evidence === null ? <p role="status">جاري تحميل الأدلة…</p>
          : !evidence.length ? <p>لا توجد أدلة حالية معروضة ضمن صلاحياتك.</p>
          : <><ul className="catalog-evidence-list">{evidence.slice(0, 3).map(item => <li key={`${item.id}-${item.link_id ?? "source"}`}>
            <span dir="auto">{item.evidence_name || item.file_name || "دليل بدون اسم"}</span>
            <StatusBadge status={item.status || ""}/>
          </li>)}</ul>{evidence.length > 3 && <p>تتوفر أدلة إضافية في صفحة الضابط.</p>}</>}
        </section>
      </div>
      <footer className="catalog-drawer-footer"><Link href={`/controls/${control.id}`} onClick={() => dialogRef.current?.close()}>فتح صفحة الضابط الكاملة <span aria-hidden="true">←</span></Link></footer>
    </article>
  </dialog>;
}
