"use client";
import AssessmentFindingLinks from "@/components/AssessmentFindingLinks";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { projectHref, registerState, updateStrategyQuery } from "@/lib/strategy-navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, createReadEpoch, unavailable, noRelationship, type ReadStatus } from "@/lib/strategy-read";
import { ReadNotice } from "./read-state";
import { projectToForm, projectWriteFields, projectDateLabels, type ProjectForm as Form } from "@/lib/strategy-project-fields";
import { getRiyadhDate, isDelayed, requirementRollup, formatDateAr, type CoverageType, type RequirementControlLink, type ProjectRequirementRow } from "./portfolio-metrics";
import { canonicalRelationships, legacyRelationships } from "@/lib/strategy-relationships";
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
  forecast_end_date: string | null;
  target_outcome: string | null;
  actual_end_date: string | null;
  progress_percent: number;
};

type LinkRow = { project_id: number; control_id: number };

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
  forecast_end_date: "",
  target_outcome: "",
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
  return <Suspense fallback={<p>جاري التحميل...</p>}><ProjectRegisterContent /></Suspense>;
}

function ProjectRegisterContent() {
  const router = useRouter();
  const params = useSearchParams();
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
  const { q: query, year: yearFilter, status: statusFilter, priority: priorityFilter } = registerState(params);
  const setQuery = (value: string) => updateStrategyQuery("q", value);
  const setYearFilter = (value: string) => updateStrategyQuery("year", value);
  const setStatusFilter = (value: string) => updateStrategyQuery("status", value);
  const setPriorityFilter = (value: string) => updateStrategyQuery("priority", value);
  const readEpoch = useRef(createReadEpoch());
  const [reads, setReads] = useState<{ projects: ReadStatus; links: ReadStatus; requirements: ReadStatus; mapping: ReadStatus }>({ projects: "UNAVAILABLE", links: "UNAVAILABLE", requirements: "UNAVAILABLE", mapping: "UNAVAILABLE" });
  const projectsReady = reads.projects === "COMPLETE";
  const linksReady = projectsReady && reads.links === "COMPLETE";
  const requirementsReady = reads.requirements === "COMPLETE";
  const mappingReady = projectsReady && requirementsReady && reads.mapping === "COMPLETE";
  const canManage = role === "admin" || role === "cybersecurity_team";

  async function load() {
    const epoch = readEpoch.current.begin();
    const [projectResult, linkResult, projectRequirementResult, requirementControlResult, activeControlResult] = await Promise.all([
      readStrategyRows((from, to) => supabase.from("cybersecurity_projects").select("*", { count: "exact" }).order("planned_year").order("planned_quarter").order("project_code").order("id").range(from, to), row => row.id),
      readStrategyRows((from, to) => supabase.from("cybersecurity_project_controls").select("project_id,control_id", { count: "exact" }).order("project_id").order("control_id").range(from, to), row => `${row.project_id}:${row.control_id}`),
      readStrategyRows((from, to) => supabase.from("cybersecurity_project_requirements").select("project_id,requirement_id,coverage_type,cybersecurity_requirements(id)", { count: "exact" }).order("project_id").order("requirement_id").range(from, to), row => `${row.project_id}:${row.requirement_id}`),
      readStrategyRows((from, to) => supabase.from("cybersecurity_requirement_controls").select("requirement_id,control_id,coverage_type,mapping_confidence,controls(evidence_status,verification_status)", { count: "exact" }).eq("mapping_status", "active").order("requirement_id").order("control_id").range(from, to), row => `${row.requirement_id}:${row.control_id}`),
      readStrategyRows((from, to) => supabase.from("controls").select("id,frameworks!inner(is_active)", { count: "exact" }).eq("frameworks.is_active",true).order("id").range(from, to), row => row.id),
    ]);
    if (!readEpoch.current.valid(epoch)) return;
    const missingEmbedded = requirementControlResult.data.some(row => !row.controls || (Array.isArray(row.controls) && !row.controls.length));
    const missingRequirement = projectRequirementResult.data.some(row => !row.cybersecurity_requirements || (Array.isArray(row.cybersecurity_requirements) && !row.cybersecurity_requirements.length));
    setReads({ projects: projectResult.status, links: linkResult.status === "COMPLETE" && activeControlResult.status === "COMPLETE" ? "COMPLETE" : "UNAVAILABLE", requirements: projectRequirementResult.status === "COMPLETE" && !missingRequirement ? "COMPLETE" : "UNAVAILABLE", mapping: requirementControlResult.status === "COMPLETE" && activeControlResult.status === "COMPLETE" && !missingEmbedded ? "COMPLETE" : "UNAVAILABLE" });
    const activeIds = new Set((activeControlResult.data ?? []).map(row => row.id));
    setProjects((projectResult.data ?? []) as Project[]);
    setLinks((linkResult.data ?? []).filter(row => activeIds.has(row.control_id)) as unknown as LinkRow[]);
    setRequirementCoverage(projectRequirementResult.data as ProjectRequirementRow[]);
    setRequirementControlLinks([]);
    if (!requirementControlResult.error && !activeControlResult.error && !missingEmbedded) {
      type RawLink = { requirement_id: number; control_id: number; coverage_type: CoverageType; mapping_confidence: "confirmed" | "probable"; controls: { evidence_status: string; verification_status: string } | { evidence_status: string; verification_status: string }[] | null };
      const rows = (requirementControlResult.data ?? []) as unknown as RawLink[];
      setRequirementControlLinks(
        rows.filter(row => activeIds.has(row.control_id)).map((row) => {
          const control = Array.isArray(row.controls) ? row.controls[0] : row.controls;
          return { requirement_id: row.requirement_id, control_id: row.control_id, coverage_type: row.coverage_type, mapping_confidence: row.mapping_confidence, evidence_status: control!.evidence_status, verification_status: control!.verification_status };
        }),
      );
    }
  }

  useEffect(() => {
    let live = true;
    const epoch = readEpoch.current;
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
        setError("غير متاح — تعذر تحميل سجل المشاريع.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
      epoch.cancel();
    };
  }, [router]);

  const requirementStats = useMemo(() => {
    if (!mappingReady) return requirementRollup([], []);
    const visibleProjects = new Set(projects.map(project => project.id));
    const scopedRequirements = requirementCoverage.filter(row => row.project_id != null && visibleProjects.has(row.project_id));
    const requirementIds = new Set(scopedRequirements.map(row => row.requirement_id));
    return requirementRollup(scopedRequirements, requirementControlLinks.filter(row => requirementIds.has(row.requirement_id)));
  }, [projects, requirementCoverage, requirementControlLinks, mappingReady]);

  const modern = useMemo(() => mappingReady ? canonicalRelationships(
    projects.map(project => project.id),
    requirementCoverage.filter((row): row is ProjectRequirementRow & { project_id: number } => row.project_id != null),
    requirementControlLinks,
  ) : null, [mappingReady, projects, requirementCoverage, requirementControlLinks]);
  const legacy = useMemo(() => legacyRelationships(
    projects.map(project => project.id), linksReady ? links : null, modern?.paths ?? null,
  ), [projects, linksReady, links, modern]);

  // Per-project display counts for the register table (Requirements / Controls /
  // Verified), derived the same way as the project detail page's rollup -- read
  // only, no new query shape, just a client-side grouping of data already loaded.
  const perProjectStats = useMemo(() => {
    const map = new Map<
      number,
      { requirementsCount: number; controlsCount: number; verifiedCount: number; confirmedCount: number; probableCount: number; requirementsWithoutMapping: number }
    >();
    if (!modern) return map;
    for (const [projectId, counts] of modern.byProject) {
      const paths = modern.paths.filter(path => path.project_id === projectId);
      const verified = new Set(paths.filter(path => path.verification_status === "verified").map(path => path.control_id));
      const mapped = new Set(paths.map(path => path.requirement_id));
      map.set(projectId, {
        requirementsCount: counts.requirements,
        controlsCount: counts.controls,
        verifiedCount: verified.size,
        confirmedCount: paths.filter(path => path.mapping_confidence === "confirmed").length,
        probableCount: paths.filter(path => path.mapping_confidence === "probable").length,
        requirementsWithoutMapping: new Set(requirementCoverage.filter(row => row.project_id === projectId && !mapped.has(row.requirement_id)).map(row => row.requirement_id)).size,
      });
    }
    return map;
  }, [requirementCoverage, modern]);

  const stats = useMemo(() => {
    const missingDates = projects.filter((project) => !project.target_end_date).length;
    return {
      total: projects.length,
      planned: projects.filter((project) => project.status === "planned").length,
      active: projects.filter((project) => project.status === "in_progress").length,
      missingDates,
      linked: legacy?.controls ?? 0,
    };
  }, [projects, legacy]);

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
    setForm(projectToForm(project));
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
        ...projectWriteFields(form, selected ?? undefined),
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
          <Link className="active" href="/roadmap">سجل المشاريع السيبرانية</Link>
          <Link href="/roadmap/analysis">تحليل المحفظة السيبرانية</Link>
          <Link href="/roadmap/dashboard">خارطة طريق المشاريع</Link>
        </nav>

        <header className="roadmap-hero project-register-hero">
          <div>
            <span>المصدر الرئيسي لبيانات المحفظة</span>
            <h1>سجل المشاريع السيبرانية</h1>
            <p>حدّث المشروع مرة واحدة لتنعكس حالته وتواريخه وروابطه على التحليل وخارطة طريق المشاريع.</p>
          </div>
          {canManage && <button className="roadmap-primary" onClick={startCreate}>+ مشروع جديد</button>}
        </header>

        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        {message && <p className="roadmap-message" role="status">{message}</p>}
        <ReadNotice statuses={Object.values(reads)} />

        <section className="roadmap-metrics register-metrics" aria-label="مؤشرات سجل المشاريع">
          <Metric label="إجمالي المشاريع" value={projectsReady ? stats.total : unavailable} />
          <Metric label="مخططة" value={projectsReady ? stats.planned : unavailable} tone="muted" />
          <Metric label="قيد التنفيذ" value={projectsReady ? stats.active : unavailable} tone="active" />
          <Metric label="بلا تاريخ مستهدف" value={projectsReady ? stats.missingDates : unavailable} tone="warning" />
          <Metric label="ضوابط ذات ربط مباشر مسجّل" value={linksReady ? stats.linked : unavailable} tone="linked" />
          <Metric label="متطلبات سيبرانية مميزة مرتبطة" value={modern ? modern.counts.requirements : unavailable} tone="linked" />
          <Metric label="علاقات مشروع–متطلب" value={modern ? modern.counts.projectRequirementLinks : unavailable} tone="linked" />
          <Metric label="ضوابط مميزة عبر المتطلبات" value={modern ? modern.counts.controls : unavailable} tone="linked" />
          <Metric label="ضوابط مرتبطة عبر المتطلبات وحالتها متحققة" value={mappingReady ? requirementStats.verified : unavailable} tone="active" />
          <Metric label="مواءمات مؤكدة (Confirmed)" value={mappingReady ? requirementStats.confirmedMappings : unavailable} tone="linked" />
          <Metric label="مواءمات محتملة (Probable)" value={mappingReady ? requirementStats.probableMappings : unavailable} tone="warning" />
          <Metric label="متطلبات بلا ربط ضوابط" value={mappingReady ? requirementStats.requirementsWithoutMapping : unavailable} tone={requirementStats.requirementsWithoutMapping ? "warning" : "muted"} />
        </section>

        <section className="register-toolbar" aria-label="تصفية سجل المشاريع">
          <label className="register-search">
            <span>بحث</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم المشروع أو رقمه أو مالكه" />
          </label>
          <label><span>السنة</span><select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}><option value="all">كل السنوات</option>{[2027, 2028, 2029].map((year) => <option key={year}>{year}</option>)}</select></label>
          <label><span>الحالة</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">كل الحالات</option>{Object.entries(statusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>الأولوية</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">كل الأولويات</option>{Object.entries(priorityText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <strong>{projectsReady ? `${filteredProjects.length} مشروع` : unavailable}</strong>
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
                  {!mappingReady ? <span>العلاقات عبر المتطلبات: {unavailable}</span> : !reqStats?.requirementsCount ? <span>العلاقات عبر المتطلبات: {noRelationship}</span> : <><span className="register-stats-line">
                    {reqStats?.requirementsCount ?? 0} متطلب · {reqStats?.controlsCount ?? 0} ضوابط · {reqStats?.verifiedCount ?? 0} متحقق
                  </span>
                  <span className="register-mapping-line">
                    {reqStats?.confirmedCount ?? 0} مسار مؤكد · {reqStats?.probableCount ?? 0} مسار محتمل
                    {Boolean(reqStats?.requirementsWithoutMapping) && <em className="register-needs-mapping">يحتاج ربط ضابط</em>}
                  </span></>}
                  <span className="register-mapping-line">روابط مباشرة موروثة: {linksReady ? new Set(links.filter(link => link.project_id === project.id).map(link => link.control_id)).size : unavailable}</span>
                </div>
                <div className="register-actions">
                  <Link className="register-action-primary" href={projectHref(project.id, "register", params)}>صفحة المشروع ←</Link>
                  <button type="button" className="register-action-secondary" onClick={() => openProject(project)}>عرض وإدارة</button>
                </div>
              </article>
            );
          })}
          {projectsReady && !filteredProjects.length && <p className="roadmap-empty">لا توجد مشاريع مطابقة للفلاتر الحالية.</p>}
        </section>

        <aside className="register-integrity-note">
          <div><strong>تعريف التغطية</strong><p>مؤشر الربط المباشر من سجل علاقات المشروع بالضابط؛ ومؤشرات المتطلبات من مسار المشروع ← المتطلب ← الضابط. المصدران منفصلان، والربط لا يثبت أثر المشروع على حالة الضابط.</p></div>
          <Link href="/controls">فتح سجل الضوابط ←</Link>
        </aside>
      </section>

      {open && (
        <div className="roadmap-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="roadmap-dialog project-register-dialog compact-form-dialog" role="dialog" aria-modal="true" aria-labelledby="roadmap-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span>{selected ? "بيانات المشروع" : "إضافة مشروع"}</span><h2 id="roadmap-dialog-title">{selected?.name_ar || "مشروع سيبراني جديد"}</h2></div><button aria-label="إغلاق" onClick={() => setOpen(false)}>×</button></header>

            <form onSubmit={save} className="roadmap-form compact-form">
              <h3 className="roadmap-form-section">بيانات المشروع</h3>
              <label>اسم المشروع<input required value={form.name_ar} onChange={(event) => setForm({ ...form, name_ar: event.target.value })} /></label>
              <label>رمز المشروع<input required dir="ltr" disabled={Boolean(selected)} value={form.project_code} onChange={(event) => setForm({ ...form, project_code: event.target.value.toUpperCase() })} placeholder="R-12" /></label>
              <label>نوع العمل<select value={form.initiative_type} onChange={(event) => setForm({ ...form, initiative_type: event.target.value })}>{Object.entries(initiativeTypeText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>الحالة<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Project["status"] })}>{Object.entries(statusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>الأولوية<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Project["priority"] })}>{Object.entries(priorityText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>السنة<select value={form.planned_year} onChange={(event) => setForm({ ...form, planned_year: Number(event.target.value) })}>{[2027, 2028, 2029].map((year) => <option key={year}>{year}</option>)}</select></label>
              <label>الربع<select value={form.planned_quarter} onChange={(event) => setForm({ ...form, planned_quarter: event.target.value })}>{["Q1", "Q2", "Q3", "Q4"].map((quarter) => <option key={quarter}>{quarter}</option>)}</select></label>
              <label>المالك التنفيذي<input value={form.executive_owner} onChange={(event) => setForm({ ...form, executive_owner: event.target.value })} /></label>

              <h3 className="roadmap-form-section">التخطيط</h3>
              <label>نسبة الإنجاز<input type="number" min="0" max="100" value={form.progress_percent} onChange={(event) => setForm({ ...form, progress_percent: Number(event.target.value) })} /></label>
              <h3 className="roadmap-form-section">التواريخ</h3>
              <label>{projectDateLabels.planned_start_date}<input dir="ltr" type="date" value={form.planned_start_date} aria-describedby={form.planned_start_date === "" ? "planned-start-empty" : undefined} onChange={(event) => setForm({ ...form, planned_start_date: event.target.value })} />{form.planned_start_date === "" && <small id="planned-start-empty">لا يوجد تاريخ مسجل</small>}</label>
              <label>{projectDateLabels.target_end_date}<input dir="ltr" type="date" value={form.target_end_date} aria-describedby={form.target_end_date === "" ? "target-end-empty" : undefined} onChange={(event) => setForm({ ...form, target_end_date: event.target.value })} />{form.target_end_date === "" && <small id="target-end-empty">لا يوجد تاريخ مسجل</small>}</label>
              <label>{projectDateLabels.forecast_end_date}<input dir="ltr" type="date" value={form.forecast_end_date} aria-describedby={form.forecast_end_date === "" ? "forecast-end-empty forecast-end-help" : "forecast-end-help"} onChange={(event) => setForm({ ...form, forecast_end_date: event.target.value })} />{form.forecast_end_date === "" && <small id="forecast-end-empty">لا يوجد تاريخ مسجل</small>}<small id="forecast-end-help">تقدير حالي مستقل عن التاريخ المستهدف؛ اختياري ولا يُعبّأ تلقائيًا.</small></label>
              {showActualStart && (
                <label>{projectDateLabels.actual_start_date}<input dir="ltr" type="date" value={form.actual_start_date} aria-describedby={form.actual_start_date === "" ? "actual-start-empty" : undefined} onChange={(event) => setForm({ ...form, actual_start_date: event.target.value })} />{form.actual_start_date === "" && <small id="actual-start-empty">لا يوجد تاريخ مسجل</small>}</label>
              )}
              {showActualEnd && (
                <label>{projectDateLabels.actual_end_date}<input dir="ltr" type="date" value={form.actual_end_date} aria-describedby={form.actual_end_date === "" ? "actual-end-empty" : undefined} onChange={(event) => setForm({ ...form, actual_end_date: event.target.value })} />{form.actual_end_date === "" && <small id="actual-end-empty">لا يوجد تاريخ مسجل</small>}</label>
              )}

              <h3 className="roadmap-form-section">وصف المشروع</h3>
              <label className="wide">وصف/هدف مختصر<textarea rows={2} value={form.description_ar} onChange={(event) => setForm({ ...form, description_ar: event.target.value })} /></label>
              <label className="wide">النتيجة المستهدفة<textarea rows={2} value={form.target_outcome} onChange={(event) => setForm({ ...form, target_outcome: event.target.value })} /><small>النتيجة المتوقع تحقيقها عند اكتمال المشروع. حقل اختياري، وليس إثباتًا لتحقق النتيجة.</small></label>

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
