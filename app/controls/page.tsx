"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { ResultSummary } from "@/components/WorkflowUI";
import { requireProfile } from "@/lib/auth";
import { catalogDetailHref, readCatalogPosition, rememberCatalogPosition } from "@/lib/control-catalog-return";
import { controlAssignmentRoles, type AppliedControlOwner } from "@/lib/control-owner-assignment";
import { getEccCatalogLabel } from "@/lib/ecc-catalog-labels";
import { supabase } from "@/lib/supabase";
import CatalogAssignment from "./catalog-assignment";
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
  (framework === "ECC" ? getEccCatalogLabel(control.control_code) : undefined)
  || control.official_text_ar || control.description_ar || cleanTitle(control.title_ar) || "ضابط بدون عنوان";

const riyadhDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
function pendingDueDate(control: Control) {
  if (control.implementation_status === "not_applicable"
      || (good(control.implementation_status) && ["verified", "approved"].includes(control.verification_status))) return null;
  return control.due_date;
}
function dueAttention(control: Control, today: string, soon: string) {
  const due = pendingDueDate(control);
  if (!due) return null;
  if (due < today) return "متأخر";
  return due <= soon ? "يستحق قريبًا" : null;
}
function byPriority(a: Control, b: Control) {
  const first = pendingDueDate(a);
  const second = pendingDueDate(b);
  if (first === second) return byCode(a, b);
  if (!first) return 1;
  if (!second) return -1;
  return first.localeCompare(second);
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
  const prioritySort = params.get("sort") === "priority";
  const view: View = params.get("view") === "structure" ? "structure" : "followup";

  const [search, setSearch] = useState("");
  const [cloudScope, setCloudScope] = useState("all");
  const [viewer, setViewer] = useState("");
  const [returnScroll, setReturnScroll] = useState<number | null>(null);
  const [controls, setControls] = useState<Control[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedControlId, setSelectedControlId] = useState<number | null>(null);
  const [assignmentNotice, setAssignmentNotice] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { user, profile } = await requireProfile();
        if (!active) return;
        setViewer(user.id);
        const previous = readCatalogPosition(user.id);
        if (previous) {
          setCloudScope(previous.cloudScope);
          setSearch(previous.search);
          setReturnScroll(previous.scroll);
        }
        setCanManage(controlAssignmentRoles.some(role => role === profile.role));
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
  useEffect(() => {
    if (loading || returnScroll === null) return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, returnScroll));
    return () => cancelAnimationFrame(frame);
  }, [loading, returnScroll]);

  const selectedFramework = frameworks.find(item => item.code === requestedFramework) ?? frameworks.find(item => item.code === "ECC") ?? frameworks[0];
  const framework = selectedFramework?.code ?? "";
  const scoped = useMemo(() => controls.filter(c => c.framework_id === selectedFramework?.id &&
    (framework !== "CCC" || cloudScope === "all" || c.control_code.includes(cloudScope === "provider" ? "-P-" : "-T-"))),
    [controls, selectedFramework, framework, cloudScope]);
  const domains = useMemo(() => Map.groupBy(scoped, c => c.domain_ar || "غير مصنف"), [scoped]);
  const domain = domains.has(requestedDomain) ? requestedDomain : [...domains.keys()][0] ?? "";
  const domainControls = domains.get(domain) ?? [];
  const ownerOptions = [...new Map(domainControls.flatMap(control => control.control_owner_id
    ? [[control.control_owner_id, control.control_owner || "مالك الضابط"] as const] : [])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "ar"));
  const ownerFilter = params.get("owner") || "";
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
    const searchMatch = normalize(`${c.control_code} ${c.title_ar} ${shortLabel(c, framework)} ${c.official_text_ar ?? ""} ${framework} ${c.control_owner ?? ""}`).includes(query);
    const statusMatch = status === "all" || (status === "implemented" ? good(c.implementation_status) : c.implementation_status === status);
    const assignmentMatch = assignment === "all" || (assignment === "assigned" ? !!c.control_owner_id : !c.control_owner_id);
    return searchMatch && statusMatch && assignmentMatch
      && (!ownerFilter || c.control_owner_id === ownerFilter)
      && (!evidenceFilter || needsEvidence(c)) && (!overdueFilter || isOverdue(c));
  }).sort(view === "followup" && prioritySort ? byPriority : byCode);
  const selectionScope = JSON.stringify([framework, domain, cloudScope, query, status, assignment, ownerFilter, evidenceFilter, overdueFilter]);
  const selectedIndex = filtered.findIndex(control => control.id === selectedControlId);
  const filtering = !!search.trim() || status !== "all" || assignment !== "all" || !!ownerFilter || evidenceFilter || overdueFilter;
  const primaryCount = scoped.filter(c => c.hierarchy_level !== "sub_control").length;

  function updateParams(values: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    next.delete("restore");
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(next.size ? `/controls?${next.toString()}` : "/controls", { scroll: false });
  }

  function clearFilters() {
    setSearch("");
    updateParams({ status: null, assignment: null, owner: null, evidence: null, due: null });
  }

  function applyOwners(rows: AppliedControlOwner[], reviewedCount: number) {
    const updated = new Map(rows.map(row => [row.id, row]));
    setControls(previous => previous.map(control => {
      const result = updated.get(control.id);
      return result ? { ...control, control_owner: result.control_owner, control_owner_id: result.control_owner_id } : control;
    }));
    setAssignmentNotice(`تم تعيين ${rows.length} من ${reviewedCount} ضابطًا.${rows.length < reviewedCount ? " لم تُحفظ بقية الضوابط. راجع القائمة قبل المحاولة من جديد." : ""}`);
  }

  const captureReturn = () => rememberCatalogPosition(viewer, search, cloudScope);
  const singleQuickFilter = status === "all" && !ownerFilter;
  const emptyKind = domainControls.length === 0 ? "scope" : search.trim() ? "search"
    : singleQuickFilter && assignment === "all" && overdueFilter && !evidenceFilter ? "overdue"
    : singleQuickFilter && assignment === "all" && evidenceFilter && !overdueFilter ? "evidence"
    : singleQuickFilter && assignment === "unassigned" && !evidenceFilter && !overdueFilter ? "owner" : "filters";

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
            <select id="catalog-framework" value={framework} onChange={e => {
              setSearch(""); setCloudScope("all");
              updateParams({ framework: e.target.value, domain: null, status: null, assignment: null, owner: null, evidence: null, due: null });
            }}>
              {frameworks.map(f => <option key={f.id} value={f.code}>{f.code}</option>)}
            </select>
          </label>
          {framework === "CCC" && <label className="catalog-field"><span>نطاق الحوسبة السحابية</span>
            <select value={cloudScope} onChange={e => { setCloudScope(e.target.value); updateParams({ domain: null, owner: null }); }}>
              <option value="all">الكل</option><option value="provider">مقدم الخدمة CSP</option><option value="tenant">المشترك CST</option>
            </select>
          </label>}
          <label className="catalog-field catalog-domain"><span>المجال</span>
            <select value={domain} disabled={!domains.size} onChange={e => updateParams({ domain: e.target.value, owner: null })}>
              {!domains.size && <option value="">لا توجد مجالات</option>}
              {[...domains.keys()].map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="catalog-field catalog-search"><span>البحث داخل المجال</span>
            <input type="search" dir="auto" value={search} onChange={e => setSearch(e.target.value)} placeholder="رقم الضابط أو النص أو المالك"/>
          </label>
          <details className="catalog-menu catalog-filter">
            <summary>التصفية{(status !== "all" || assignment !== "all" || ownerFilter) && <span className="catalog-filter-dot" aria-label="تصفية نشطة"/>}</summary>
            <div className="catalog-menu-panel catalog-filter-panel">
              <label className="catalog-field"><span>حالة التنفيذ</span>
                <select value={status} onChange={e => updateParams({ status: e.target.value === "all" ? null : e.target.value })}>
                  <option value="all">كل الحالات</option><option value="implemented">مطبق كليًا</option><option value="in_progress">مطبق جزئيًا</option><option value="not_started">غير مطبق</option><option value="not_applicable">لا ينطبق</option>
                </select>
              </label>
              <label className="catalog-field"><span>الإسناد</span>
                <select value={assignment} onChange={e => updateParams({ assignment: e.target.value === "all" ? null : e.target.value, owner: null })}>
                  <option value="all">الكل</option><option value="assigned">معيّن</option><option value="unassigned">غير معيّن</option>
                </select>
              </label>
              <label className="catalog-field"><span>المالك الحالي</span>
                <select value={ownerFilter} onChange={e => updateParams({ owner: e.target.value || null, assignment: null })}>
                  <option value="">كل الملاك</option>
                  {ownerFilter && !ownerOptions.some(([id]) => id === ownerFilter) && <option value={ownerFilter}>لا ضوابط للمالك المحدد</option>}
                  {ownerOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
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
            <button type="button" aria-pressed={assignment === "unassigned" && !ownerFilter} onClick={() => updateParams({ assignment: assignment === "unassigned" && !ownerFilter ? null : "unassigned", owner: null })}>
              بلا مالك <span className="catalog-quick-count">{quickCounts.unassigned}</span>
            </button>
            <button type="button" aria-pressed={overdueFilter} onClick={() => updateParams({ due: overdueFilter ? null : "overdue" })}>
              متأخر <span className={`catalog-quick-count ${quickCounts.overdue ? "is-overdue" : ""}`}>{quickCounts.overdue}</span>
            </button>
          </div>
          <div className="catalog-results-options">
            {view === "followup" && <label className="catalog-sort"><span>الترتيب</span>
              <select value={prioritySort ? "priority" : "code"} onChange={e => updateParams({ sort: e.target.value === "priority" ? "priority" : null })}>
                <option value="code">رقم الضابط</option><option value="priority">الأولوية</option>
              </select>
            </label>}
            <ResultSummary count={filtered.length} total={domainControls.length} active={filtering} reset={clearFilters}/>
          </div>
        </div>
        {assignmentNotice && <p className="catalog-assignment-notice" role="status">{assignmentNotice}</p>}
        {!filtered.length ? <CatalogEmpty kind={emptyKind} onClearSearch={() => setSearch("")} onClearFilters={clearFilters}/>
        : view === "structure" ? <StructureList rows={filtered} domainControls={domainControls} framework={framework} filtering={filtering} onNavigate={captureReturn}/>
        : <CatalogTable key={selectionScope} rows={filtered} framework={framework} today={today} nextWeek={nextWeek}
          canManage={canManage} onOpen={setSelectedControlId} onApplied={applyOwners} onNavigate={captureReturn}/>}
      </section>
      {selectedIndex >= 0 && <ControlDrawer control={filtered[selectedIndex]} framework={selectedFramework}
        position={selectedIndex + 1} total={filtered.length}
        onPrevious={selectedIndex > 0 ? () => setSelectedControlId(filtered[selectedIndex - 1].id) : undefined}
        onNext={selectedIndex + 1 < filtered.length ? () => setSelectedControlId(filtered[selectedIndex + 1].id) : undefined}
        onNavigate={captureReturn}
        onClose={() => setSelectedControlId(null)}/>}
    </>}
  </main>;
}

function CatalogEmpty({ kind, onClearSearch, onClearFilters }: {
  kind: "scope" | "search" | "overdue" | "evidence" | "owner" | "filters";
  onClearSearch: () => void;
  onClearFilters: () => void;
}) {
  const content = {
    scope: ["لا توجد ضوابط في النطاق المحدد", "اختر إطارًا آخر لعرض الضوابط المتاحة ضمن صلاحياتك.", "اختيار إطار"],
    search: ["لا توجد نتائج مطابقة للبحث", "جرّب رقم ضابط أو عبارة أقصر، أو امسح البحث مع الإبقاء على الفلاتر.", "مسح البحث"],
    overdue: ["لا توجد ضوابط متأخرة في هذا المجال", "يمكنك العودة إلى القائمة الكاملة لمتابعة بقية الضوابط.", "عرض الكل"],
    evidence: ["لا توجد ضوابط تحتاج دليلًا في هذا المجال", "يمكنك العودة إلى القائمة الكاملة لمتابعة بقية الضوابط.", "عرض الكل"],
    owner: ["لا توجد ضوابط بلا مالك في هذا المجال", "يمكنك العودة إلى القائمة الكاملة لمتابعة بقية الضوابط.", "عرض الكل"],
    filters: ["لا توجد ضوابط تطابق الفلاتر الحالية", "أزل الفلاتر لعرض كل الضوابط في هذا المجال.", "عرض الكل"],
  }[kind];
  return <div className="catalog-empty catalog-empty-state">
    <div><h2>{content[0]}</h2><p>{content[1]}</p></div>
    <button type="button" onClick={kind === "search" ? onClearSearch : kind === "scope"
      ? () => document.getElementById("catalog-framework")?.focus() : onClearFilters}>{content[2]}</button>
  </div>;
}

function CatalogTable({ rows, framework, today, nextWeek, canManage, onOpen, onApplied, onNavigate }: {
  rows: Control[];
  framework: string;
  today: string;
  nextWeek: string;
  canManage: boolean;
  onOpen: (id: number) => void;
  onApplied: (rows: AppliedControlOwner[], reviewedCount: number) => void;
  onNavigate: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assignmentIds, setAssignmentIds] = useState<number[] | null>(null);
  const visibleSelection = rows.filter(row => selected.has(row.id));
  const allSelected = visibleSelection.length === rows.length;

  function toggle(id: number) {
    setSelected(previous => {
      const updated = new Set(previous);
      if (updated.has(id)) updated.delete(id);
      else updated.add(id);
      return updated;
    });
  }

  return <>
    <table className="catalog-table" aria-label="متابعة الضوابط" role="table">
      <colgroup><col/><col className="catalog-owner-col"/><col className="catalog-status-col"/><col className="catalog-status-col"/></colgroup>
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader"><div className="catalog-selectable-cell">
          {canManage && <input className="catalog-select-control" type="checkbox" checked={allSelected}
            ref={element => { if (element) element.indeterminate = visibleSelection.length > 0 && !allSelected; }}
            onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(row => row.id)))} aria-label="تحديد كل الضوابط المعروضة"/>} الضابط
        </div></th>
        <th scope="col" role="columnheader">المالك</th><th scope="col" role="columnheader">التنفيذ</th><th scope="col" role="columnheader">الدليل</th>
      </tr></thead>
      <tbody role="rowgroup">{rows.map(control => {
        const label = shortLabel(control, framework);
        const attention = dueAttention(control, today, nextWeek);
        return <tr key={control.id} role="row" className={selected.has(control.id) ? "catalog-row-selected" : undefined}>
          <th scope="row" role="rowheader"><div className="catalog-selectable-cell">
            {canManage && <input className="catalog-select-control" type="checkbox" checked={selected.has(control.id)}
              onChange={() => toggle(control.id)} aria-label={`تحديد الضابط ${control.control_code}`}/>}
            <Link className="catalog-control-link" href={catalogDetailHref(control.id)} prefetch={false} onNavigate={event => {
              if (!window.matchMedia("(min-width: 761px)").matches) { onNavigate(); return; }
              event.preventDefault(); onOpen(control.id);
            }}>
              <span className="catalog-control-line">
                <bdi className="catalog-code" dir="ltr">{control.control_code}</bdi>
                <span className="catalog-control-label" title={label}>{label}</span>
              </span>
              {attention && <span className={`catalog-deadline ${attention === "متأخر" ? "is-overdue" : ""}`}>{attention}</span>}
            </Link>
          </div></th>
          <td role="cell"><span className="catalog-mobile-label" aria-hidden="true">المالك</span><bdi className="catalog-owner" title={control.control_owner ?? undefined}>{control.control_owner || "غير معيّن"}</bdi></td>
          <td role="cell"><span className="catalog-mobile-label" aria-hidden="true">التنفيذ</span><StatusBadge status={control.implementation_status}/></td>
          <td role="cell"><span className="catalog-mobile-label" aria-hidden="true">الدليل</span><StatusBadge status={control.evidence_status}/></td>
        </tr>;
      })}</tbody>
    </table>
    {canManage && visibleSelection.length > 0 && <div className="catalog-selection-bar" role="group" aria-label="إجراءات الضوابط المحددة">
      <span role="status">عدد الضوابط المحددة: <strong>{visibleSelection.length}</strong></span>
      <button type="button" className="catalog-assignment-primary" onClick={() => setAssignmentIds(visibleSelection.map(control => control.id))}>تعيين مالك</button>
      <button type="button" onClick={() => setSelected(new Set())}>إلغاء التحديد</button>
    </div>}
    {canManage && assignmentIds && <CatalogAssignment ids={assignmentIds} onClose={() => setAssignmentIds(null)}
      onApplied={(applied, count) => {
        onApplied(applied, count); setSelected(new Set()); setAssignmentIds(null);
      }}/>}
  </>;
}

function StructureList({ rows, domainControls, framework, filtering, onNavigate }: {
  rows: Control[]; domainControls: Control[]; framework: string; filtering: boolean; onNavigate: () => void;
}) {
  // Keep a matching child reachable even when the search excludes its parent.
  const shown = new Set(rows.map(row => row.id));
  const parents = new Set(rows.flatMap(row => row.parent_control_id == null ? [] : [row.parent_control_id]));
  const withParents = [...rows, ...domainControls.filter(row => parents.has(row.id) && !shown.has(row.id))].sort(byCode);
  const groups = Map.groupBy(withParents, row => row.control_code.split("-").slice(0, 2).join("-"));
  function item(row: Control) {
    const applicability = applicabilityLabel(row.applicability);
    return <Link className="catalog-structure-link" href={catalogDetailHref(row.id)} prefetch={false} onNavigate={onNavigate}>
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

function ControlDrawer({ control, framework, position, total, onPrevious, onNext, onClose, onNavigate }: {
  control: Control;
  framework: Framework;
  position: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [evidenceRegister, setEvidenceRegister] = useState<EvidencePreview[] | null>(null);
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
        const rows = ((data ?? []) as EvidencePreview[]).filter(item => item.is_current)
          .map(({ id, control_id, link_id, evidence_name, file_name, status, is_current, uploaded_at }) =>
            ({ id, control_id, link_id, evidence_name, file_name, status, is_current, uploaded_at }));
        if (active) setEvidenceRegister(rows);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [control.id]);

  const evidence = evidenceRegister?.filter(item => item.control_id === control.id)
    .sort((a, b) => (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? "")).slice(0, 4) ?? null;

  const applicability = applicabilityLabel(control.applicability);
  return <dialog className="catalog-drawer" dir="rtl" ref={dialogRef} aria-labelledby="catalog-drawer-title" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
    <article>
      <header className="catalog-drawer-header">
        <div className="catalog-drawer-meta"><bdi className="catalog-code" dir="ltr">{control.control_code}</bdi><bdi>{framework.code}</bdi> <span>{control.hierarchy_level === "sub_control" ? "بند فرعي" : "ضابط أساسي"}</span></div>
        <button className="catalog-close" type="button" autoFocus aria-label="إغلاق تفاصيل الضابط" onClick={() => dialogRef.current?.close()}>×</button>
        <h2 id="catalog-drawer-title">{(framework.code === "ECC" ? getEccCatalogLabel(control.control_code) : undefined) || cleanTitle(control.title_ar) || "تفاصيل الضابط"}</h2>
        <p>{control.domain_ar}{applicability && ` · ${applicability}`}</p>
        <nav className="catalog-drawer-navigation" aria-label="التنقل بين الضوابط المعروضة">
          <button type="button" aria-disabled={!onPrevious} onClick={onPrevious}>السابق</button>
          <span role="status">{position} من {total}</span>
          <button type="button" aria-disabled={!onNext} onClick={onNext}>التالي</button>
        </nav>
      </header>
      <div className="catalog-drawer-body" ref={bodyRef}>
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
      <footer className="catalog-drawer-footer"><Link href={catalogDetailHref(control.id)} onNavigate={() => {
        onNavigate(); dialogRef.current?.close();
      }}>فتح صفحة الضابط الكاملة <span aria-hidden="true">←</span></Link></footer>
    </article>
  </dialog>;
}
