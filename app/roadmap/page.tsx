"use client";
import AssessmentFindingLinks from "@/components/AssessmentFindingLinks";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getRiyadhDate, isDelayed, requirementRollup, formatDateAr, type CoverageType, type RequirementControlLink, type ProjectRequirementRow } from "./portfolio-metrics";
import "./roadmap.css";

type Project = {
  id: number;
  project_code: string;
  name_ar: string;
  description_ar: string | null;
  planned_year: number;
  planned_quarter: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  priority: "high" | "medium" | "low";
  initiative_type: string;
  executive_owner: string | null;
  planned_start_date: string | null;
  actual_start_date: string | null;
  target_end_date: string | null;
  actual_end_date: string | null;
  progress_percent: number;
};

type LinkRow = { project_id: number; control_id: number };

type Form = {
  project_code: string;
  name_ar: string;
  initiative_type: string;
  status: Project["status"];
  priority: Project["priority"];
  planned_year: number;
  planned_quarter: string;
  executive_owner: string;
  planned_start_date: string;
  target_end_date: string;
  actual_start_date: string;
  actual_end_date: string;
  progress_percent: number;
  description_ar: string;
};

const emptyForm: Form = {
  project_code: "",
  name_ar: "",
  initiative_type: "technology_project",
  status: "planned",
  priority: "medium",
  planned_year: 2027,
  planned_quarter: "Q1",
  executive_owner: "",
  planned_start_date: "",
  target_end_date: "",
  actual_start_date: "",
  actual_end_date: "",
  progress_percent: 0,
  description_ar: "",
};

const statusText = {
  planned: "مخطط",
  in_progress: "قيد التنفيذ",
  on_hold: "متوقف",
  completed: "مكتمل",
};
const priorityText = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const initiativeTypeText: Record<string, string> = {
  technology_project: "مشروع تقني",
  managed_service: "خدمة مُدارة",
  framework_agreement: "اتفاقية إطارية",
  internal_program: "برنامج داخلي",
  policy_governance: "سياسة وحوكمة",
  assessment: "تقييم",
  continuous_activity: "نشاط مستمر",
};

export default function ProjectRegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("control_owner");
  const [projects, setProjects] = useState<Project[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [requirementCoverage, setRequirementCoverage] = useState<ProjectRequirementRow[]>([]);
  const [requirementControlLinks, setRequirementControlLinks] = useState<RequirementControlLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const canManage = role === "admin" || role === "cybersecurity_team";

  async function load() {
    const [projectResult, linkResult, projectRequirementResult, requirementControlResult, activeControlResult] = await Promise.all([
      supabase.from("cybersecurity_projects").select("*").order("planned_year").order("planned_quarter").order("project_code"),
      supabase.from("cybersecurity_project_controls").select("project_id,control_id"),
      supabase.from("cybersecurity_project_requirements").select("project_id,requirement_id,coverage_type"),
      supabase.from("cybersecurity_requirement_controls").select("requirement_id,control_id,coverage_type,mapping_confidence,controls(evidence_status,verification_status)"),
      supabase.from("controls").select("id,frameworks!inner(is_active)").eq("frameworks.is_active",true),
    ]);
    if (projectResult.error) throw projectResult.error;
    if (linkResult.error) throw linkResult.error;
    if (activeControlResult.error) throw activeControlResult.error;
    const activeIds = new Set((activeControlResult.data ?? []).map(row => row.id));
    setProjects((projectResult.data ?? []) as Project[]);
    setLinks((linkResult.data ?? []).filter(row => activeIds.has(row.control_id)) as unknown as LinkRow[]);
    if (!projectRequirementResult.error) {
      setRequirementCoverage((projectRequirementResult.data ?? []) as ProjectRequirementRow[]);
    }
    if (!requirementControlResult.error) {
      type RawLink = { requirement_id: number; control_id: number; coverage_type: CoverageType; mapping_confidence: "confirmed" | "probable"; controls: { evidence_status: string; verification_status: string } | { evidence_status: string; verification_status: string }[] | null };
      const rows = (requirementControlResult.data ?? []) as unknown as RawLink[];
      setRequirementControlLinks(
        rows.filter(row => activeIds.has(row.control_id)).map((row) => {
          const control = Array.isArray(row.controls) ? row.controls[0] : row.controls;
          return { requirement_id: row.requirement_id, control_id: row.control_id, coverage_type: row.coverage_type, mapping_confidence: row.mapping_confidence, evidence_status: control?.evidence_status ?? "not_uploaded", verification_status: control?.verification_status ?? "not_verified" };
        }),
      );
    }
  }

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { profile } = await requireProfile();
        if (!live) return;
        setRole(profile.role);
        await load();
      } catch (cause) {
        if (!live) return;
        const detail = cause instanceof Error ? cause.message : "";
        if (detail.includes("تسجيل الدخول")) {
          router.replace("/login");
          return;
        }
        setError(
          detail.includes("cybersecurity_projects") || detail.includes("schema cache")
            ? "سجل المشاريع ينتظر تطبيق تحديث قاعدة البيانات على البيئة الحالية."
            : detail || "تعذر تحميل سجل المشاريع.",
        );
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [router]);

  const requirementStats = useMemo(
    () => requirementRollup(requirementCoverage, requirementControlLinks),
    [requirementCoverage, requirementControlLinks],
  );

  // Per-project display counts for the register table (Requirements / Controls /
  // Verified), derived the same way as the project detail page's rollup -- read
  // only, no new query shape, just a client-side grouping of data already loaded.
  const perProjectStats = useMemo(() => {
    const map = new Map<
      number,
      { requirementsCount: number; controlsCount: number; verifiedCount: number; confirmedCount: number; probableCount: number; requirementsWithoutMapping: number }
    >();
    const reqToProject = new Map<number, number>();
    const reqIdsWithLinks = new Set<number>();
    for (const row of requirementCoverage) {
      if (row.project_id == null) continue;
      reqToProject.set(row.requirement_id, row.project_id);
      const entry = map.get(row.project_id) ?? { requirementsCount: 0, controlsCount: 0, verifiedCount: 0, confirmedCount: 0, probableCount: 0, requirementsWithoutMapping: 0 };
      entry.requirementsCount += 1;
      map.set(row.project_id, entry);
    }
    const seenPerProject = new Map<number, Set<number>>();
    for (const link of requirementControlLinks) {
      const projectId = reqToProject.get(link.requirement_id);
      if (projectId == null) continue;
      reqIdsWithLinks.add(link.requirement_id);
      const seen = seenPerProject.get(projectId) ?? new Set<number>();
      if (seen.has(link.control_id)) continue;
      seen.add(link.control_id);
      seenPerProject.set(projectId, seen);
      const entry = map.get(projectId);
      if (!entry) continue;
      entry.controlsCount += 1;
      if (link.verification_status === "verified") entry.verifiedCount += 1;
      if (link.mapping_confidence === "confirmed") entry.confirmedCount += 1;
      else entry.probableCount += 1;
    }
    for (const row of requirementCoverage) {
      if (row.project_id == null || reqIdsWithLinks.has(row.requirement_id)) continue;
      const entry = map.get(row.project_id);
      if (entry) entry.requirementsWithoutMapping += 1;
    }
    return map;
  }, [requirementCoverage, requirementControlLinks]);

  const stats = useMemo(() => {
    const missingDates = projects.filter((project) => !project.target_end_date).length;
    return {
      total: projects.length,
      planned: projects.filter((project) => project.status === "planned").length,
      active: projects.filter((project) => project.status === "in_progress").length,
      missingDates,
      linked: new Set(links.map((link) => link.control_id)).size,
    };
  }, [projects, links]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ar");
    return projects.filter((project) => {
      const matchesQuery =
        !normalized ||
        `${project.project_code} ${project.name_ar} ${project.executive_owner ?? ""}`
          .toLocaleLowerCase("ar")
          .includes(normalized);
      return (
        matchesQuery &&
        (yearFilter === "all" || String(project.planned_year) === yearFilter) &&
        (statusFilter === "all" || project.status === statusFilter) &&
        (priorityFilter === "all" || project.priority === priorityFilter)
      );
    });
  }, [projects, query, yearFilter, statusFilter, priorityFilter]);

  function startCreate() {
    setSelected(null);
    setForm(emptyForm);
    setOpen(true);
    setMessage("");
    setError("");
  }

  function openProject(project: Project) {
    setSelected(project);
    setForm({
      project_code: project.project_code,
      name_ar: project.name_ar,
      initiative_type: project.initiative_type,
      status: project.status,
      priority: project.priority,
      planned_year: project.planned_year,
      planned_quarter: project.planned_quarter,
      executive_owner: project.executive_owner ?? "",
      planned_start_date: project.planned_start_date ?? "",
      target_end_date: project.target_end_date ?? "",
      actual_start_date: project.actual_start_date ?? "",
      actual_end_date: project.actual_end_date ?? "",
      progress_percent: Number(project.progress_percent) || 0,
      description_ar: project.description_ar ?? "",
    });
    setOpen(true);
    setMessage("");
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { user } = await requireProfile(["admin", "cybersecurity_team"]);
      const payload = {
        project_code: form.project_code,
        name_ar: form.name_ar,
        initiative_type: form.initiative_type,
        status: form.status,
        priority: form.priority,
        planned_year: form.planned_year,
        planned_quarter: form.planned_quarter,
        executive_owner: form.executive_owner || null,
        planned_start_date: form.planned_start_date || null,
        target_end_date: form.target_end_date || null,
        actual_start_date: form.actual_start_date || null,
        actual_end_date: form.actual_end_date || null,
        progress_percent: Number(form.progress_percent),
        description_ar: form.description_ar || null,
        updated_at: new Date().toISOString(),
      };
      if (selected) {
        const result = await supabase.from("cybersecurity_projects").update(payload).eq("id", selected.id).select("*").single();
        if (result.error) throw result.error;
        setOpen(false);
        setMessage("تم حفظ التعديلات.");
        setSaving(false);
        await load();
      } else {
        const result = await supabase.from("cybersecurity_projects").insert({ ...payload, created_by: user.id }).select("id").single();
        if (result.error) throw result.error;
        router.push(`/roadmap/${result.data.id}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ المشروع.");
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحميل سجل المشاريع…</p></main>;
  }

  const showActualStart = form.status === "in_progress" || form.status === "completed";
  const showActualEnd = form.status === "completed";

  return (
    <main className="roadmap-page" dir="rtl">
      <section className="roadmap-shell">
        <nav className="roadmap-view-tabs" aria-label="إدارة محفظة الأمن السيبراني">
          <Link className="active" href="/roadmap">سجل المشاريع</Link>
          <Link href="/roadmap/analysis">تحليل المحفظة</Link>
          <Link href="/roadmap/dashboard">خارطة الطريق</Link>
        </nav>

        <header className="roadmap-hero project-register-hero">
          <div>
            <span>المصدر الرئيسي لبيانات المحفظة</span>
            <h1>سجل مشاريع الأمن السيبراني</h1>
            <p>حدّث المشروع مرة واحدة لتنعكس حالته وتواريخه وروابطه على التحليل وخارطة الطريق.</p>
          </div>
          {canManage && <button className="roadmap-primary" onClick={startCreate}>+ مشروع جديد</button>}
        </header>

        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        {message && <p className="roadmap-message" role="status">{message}</p>}

        <section className="roadmap-metrics register-metrics" aria-label="مؤشرات سجل المشاريع">
          <Metric label="إجمالي المشاريع" value={stats.total} />
          <Metric label="مخططة" value={stats.planned} tone="muted" />
          <Metric label="قيد التنفيذ" value={stats.active} tone="active" />
          <Metric label="بلا تاريخ مستهدف" value={stats.missingDates} tone="warning" />
          <Metric label="ضوابط مرتبطة بمشروع معالجة" value={stats.linked} tone="linked" />
          <Metric label="متطلبات سيبرانية مرتبطة" value={requirementStats.requirementsCount} tone="linked" />
          <Metric label="ضوابط مُتحقَّقة عبر المتطلبات" value={requirementStats.verified} tone="active" />
          <Metric label="ربط مؤكَّد (Confirmed)" value={requirementStats.confirmedMappings} tone="linked" />
          <Metric label="ربط محتمل (Probable)" value={requirementStats.probableMappings} tone="warning" />
          <Metric label="متطلبات بلا ربط ضوابط" value={requirementStats.requirementsWithoutMapping} tone={requirementStats.requirementsWithoutMapping ? "warning" : "muted"} />
        </section>

        <section className="register-toolbar" aria-label="تصفية سجل المشاريع">
          <label className="register-search">
            <span>بحث</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم المشروع أو رقمه أو مالكه" />
          </label>
          <label><span>السنة</span><select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}><option value="all">كل السنوات</option>{[2027, 2028, 2029].map((year) => <option key={year}>{year}</option>)}</select></label>
          <label><span>الحالة</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">كل الحالات</option>{Object.entries(statusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>الأولوية</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">كل الأولويات</option>{Object.entries(priorityText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <strong>{filteredProjects.length} مشروع</strong>
        </section>

        <section className="project-register-table" aria-label="المشاريع">
          <div className="project-register-head">
            <span>المشروع</span><span>النوع</span><span>الحالة</span><span>الأولوية</span><span>الإنجاز</span><span>المتطلبات والضوابط</span><span aria-hidden="true" />
          </div>
          {filteredProjects.map((project) => {
            const delayed = isDelayed(project, getRiyadhDate());
            const reqStats = perProjectStats.get(project.id);
            return (
              <article key={project.id} className={delayed ? "is-delayed" : ""}>
                <div className="project-register-name">
                  <b dir="ltr">{project.project_code}</b>
                  <strong>{project.name_ar}</strong>
                  <small>
                    {project.planned_year} · {project.planned_quarter}
                    {project.executive_owner ? ` · ${project.executive_owner}` : ""}
                    {" · "}
                    <span dir="ltr">{formatDateAr(project.target_end_date)}</span>
                    {delayed && <em className="register-delayed-flag">متأخر</em>}
                  </small>
                </div>
                <span className="register-initiative-type">{initiativeTypeText[project.initiative_type] ?? project.initiative_type}</span>
                <span className={`roadmap-status ${project.status}`}>{statusText[project.status]}</span>
                <span className={`register-priority ${project.priority}`}>{priorityText[project.priority]}</span>
                <div className="register-progress"><b>{Number(project.progress_percent)}%</b><i><span style={{ width: `${Math.max(0, Math.min(100, Number(project.progress_percent)))}%` }} /></i></div>
                <div className="register-req-ctrl-stats">
                  <span className="register-stats-line">
                    {reqStats?.requirementsCount ?? 0} متطلب · {reqStats?.controlsCount ?? 0} ضوابط · {reqStats?.verifiedCount ?? 0} متحقق
                  </span>
                  <span className="register-mapping-line">
                    {reqStats?.confirmedCount ?? 0} مؤكد · {reqStats?.probableCount ?? 0} محتمل
                    {Boolean(reqStats?.requirementsWithoutMapping) && <em className="register-needs-mapping">يحتاج ربط ضابط</em>}
                  </span>
                </div>
                <div className="register-actions">
                  <Link className="register-action-primary" href={`/roadmap/${project.id}`}>صفحة المشروع ←</Link>
                  <button type="button" className="register-action-secondary" onClick={() => openProject(project)}>عرض وإدارة</button>
                </div>
              </article>
            );
          })}
          {!filteredProjects.length && <p className="roadmap-empty">لا توجد مشاريع مطابقة للفلاتر الحالية.</p>}
        </section>

        <aside className="register-integrity-note">
          <div><strong>تعريف التغطية</strong><p>الربط الرسمي المعتمد الآن هو المشروع ← المتطلب ← الضابط، ويُدار من صفحة المشروع. هذا السجل يعرض بيانات المشروع الأساسية فقط.</p></div>
          <Link href="/controls">فتح سجل الضوابط ←</Link>
        </aside>
      </section>

      {open && (
        <div className="roadmap-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="roadmap-dialog project-register-dialog compact-form-dialog" role="dialog" aria-modal="true" aria-labelledby="roadmap-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span>{selected ? "بيانات المشروع" : "إضافة مشروع"}</span><h2 id="roadmap-dialog-title">{selected?.name_ar || "مبادرة سيبرانية جديدة"}</h2></div><button aria-label="إغلاق" onClick={() => setOpen(false)}>×</button></header>

            <form onSubmit={save} className="roadmap-form compact-form">
              <h3 className="roadmap-form-section">بيانات المشروع</h3>
              <label>اسم المشروع<input required value={form.name_ar} onChange={(event) => setForm({ ...form, name_ar: event.target.value })} /></label>
              <label>رمز المشروع<input required dir="ltr" disabled={Boolean(selected)} value={form.project_code} onChange={(event) => setForm({ ...form, project_code: event.target.value.toUpperCase() })} placeholder="R-12" /></label>
              <label>نوع المبادرة<select value={form.initiative_type} onChange={(event) => setForm({ ...form, initiative_type: event.target.value })}>{Object.entries(initiativeTypeText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>الحالة<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Project["status"] })}>{Object.entries(statusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>الأولوية<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Project["priority"] })}>{Object.entries(priorityText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>السنة<select value={form.planned_year} onChange={(event) => setForm({ ...form, planned_year: Number(event.target.value) })}>{[2027, 2028, 2029].map((year) => <option key={year}>{year}</option>)}</select></label>
              <label>الربع<select value={form.planned_quarter} onChange={(event) => setForm({ ...form, planned_quarter: event.target.value })}>{["Q1", "Q2", "Q3", "Q4"].map((quarter) => <option key={quarter}>{quarter}</option>)}</select></label>
              <label>المالك التنفيذي<input value={form.executive_owner} onChange={(event) => setForm({ ...form, executive_owner: event.target.value })} /></label>

              <h3 className="roadmap-form-section">التخطيط</h3>
              <label>تاريخ البداية المستهدف<input dir="ltr" type="date" value={form.planned_start_date} onChange={(event) => setForm({ ...form, planned_start_date: event.target.value })} /></label>
              <label>تاريخ الإنجاز المستهدف<input dir="ltr" type="date" value={form.target_end_date} onChange={(event) => setForm({ ...form, target_end_date: event.target.value })} /></label>
              <label>نسبة الإنجاز<input type="number" min="0" max="100" value={form.progress_percent} onChange={(event) => setForm({ ...form, progress_percent: Number(event.target.value) })} /></label>
              {showActualStart && (
                <label>تاريخ البدء الفعلي<input dir="ltr" type="date" value={form.actual_start_date} onChange={(event) => setForm({ ...form, actual_start_date: event.target.value })} /></label>
              )}
              {showActualEnd && (
                <label>تاريخ الإنجاز الفعلي<input dir="ltr" type="date" value={form.actual_end_date} onChange={(event) => setForm({ ...form, actual_end_date: event.target.value })} /></label>
              )}

              <h3 className="roadmap-form-section">وصف المشروع</h3>
              <label className="wide">وصف/هدف مختصر<textarea rows={2} value={form.description_ar} onChange={(event) => setForm({ ...form, description_ar: event.target.value })} /></label>

              <footer>
                <button type="button" onClick={() => setOpen(false)}>إلغاء</button>
                {canManage && <button className="roadmap-primary" disabled={saving}>{saving ? "جاري الحفظ…" : selected ? "حفظ التعديلات" : "حفظ وإنشاء المشروع"}</button>}
              </footer>
            </form>
          </section>
        </div>
      )}
    <AssessmentFindingLinks/></main>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return <article className={`roadmap-metric ${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}
