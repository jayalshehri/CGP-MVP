"use client";
import AssessmentFindingLinks from "@/components/AssessmentFindingLinks";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getRiyadhDate, isDelayed, requirementRollup, type CoverageType, type RequirementControlLink } from "./portfolio-metrics";
import "./roadmap.css";

type Control = {
  id: number;
  control_code: string;
  title_ar: string;
  frameworks: { code: string; name_ar: string } | { code: string; name_ar: string }[] | null;
};

type Project = {
  id: number;
  project_code: string;
  name_ar: string;
  description_ar: string | null;
  planned_year: number;
  planned_quarter: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  priority: "high" | "medium" | "low";
  executive_owner: string | null;
  solution_scope: string | null;
  framework_scope: string | null;
  target_outcome: string | null;
  recommended_technologies: string | null;
  planned_start_date: string | null;
  actual_start_date: string | null;
  target_end_date: string | null;
  forecast_end_date: string | null;
  actual_end_date: string | null;
  progress_percent: number;
  notes: string | null;
};

type LinkRow = {
  project_id: number;
  control_id: number;
  relationship_type: "primary" | "coverage" | "dependency";
  controls: Control | Control[] | null;
};

type GapTreatment = {
  id: number;
  project_id: number;
  gap_title: string;
  treatment_type: "technology" | "procedure" | "policy" | "training";
  recommendation: string;
  priority: "high" | "medium" | "low";
};

type Form = {
  project_code: string;
  name_ar: string;
  planned_year: number;
  planned_quarter: string;
  status: Project["status"];
  priority: Project["priority"];
  executive_owner: string;
  solution_scope: string;
  target_outcome: string;
  recommended_technologies: string;
  planned_start_date: string;
  actual_start_date: string;
  target_end_date: string;
  forecast_end_date: string;
  progress_percent: number;
  notes: string;
};

const emptyForm: Form = {
  project_code: "",
  name_ar: "",
  planned_year: 2027,
  planned_quarter: "Q1",
  status: "planned",
  priority: "medium",
  executive_owner: "",
  solution_scope: "",
  target_outcome: "",
  recommended_technologies: "",
  planned_start_date: "",
  actual_start_date: "",
  target_end_date: "",
  forecast_end_date: "",
  progress_percent: 0,
  notes: "",
};

const treatmentText = {
  technology: "تقنية",
  procedure: "إجراء",
  policy: "وثيقة/سياسة",
  training: "تدريب",
};
const statusText = {
  planned: "مخطط",
  in_progress: "قيد التنفيذ",
  on_hold: "متوقف",
  completed: "مكتمل",
};
const priorityText = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const frameworkOf = (value: Control["frameworks"] | undefined) =>
  Array.isArray(value) ? value[0] : value;
const controlOf = (value: LinkRow["controls"]) => (Array.isArray(value) ? value[0] : value);

export default function ProjectRegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("control_owner");
  const [projects, setProjects] = useState<Project[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [treatments, setTreatments] = useState<GapTreatment[]>([]);
  const [requirementCoverage, setRequirementCoverage] = useState<CoverageType[]>([]);
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
  const [controlSearch, setControlSearch] = useState("");
  const [gapTitle, setGapTitle] = useState("");
  const [treatmentType, setTreatmentType] = useState<GapTreatment["treatment_type"]>("technology");
  const [recommendation, setRecommendation] = useState("");
  const [treatmentPriority, setTreatmentPriority] = useState<GapTreatment["priority"]>("medium");
  const canManage = role === "admin" || role === "cybersecurity_team";

  async function load() {
    const [projectResult, controlResult, linkResult, treatmentResult, projectRequirementResult, requirementControlResult] = await Promise.all([
      supabase.from("cybersecurity_projects").select("*").order("planned_year").order("planned_quarter").order("project_code"),
      supabase.from("controls").select("id,control_code,title_ar,frameworks!inner(code,name_ar)").order("control_code"),
      supabase.from("cybersecurity_project_controls").select("project_id,control_id,relationship_type,controls(id,control_code,title_ar,frameworks(code,name_ar))"),
      supabase.from("cybersecurity_project_gap_treatments").select("id,project_id,gap_title,treatment_type,recommendation,priority").order("id"),
      supabase.from("cybersecurity_project_requirements").select("coverage_type"),
      supabase.from("cybersecurity_requirement_controls").select("requirement_id,control_id,coverage_type,controls(evidence_status,verification_status)"),
    ]);
    if (projectResult.error) throw projectResult.error;
    if (controlResult.error) throw controlResult.error;
    if (linkResult.error) throw linkResult.error;
    if (treatmentResult.error) throw treatmentResult.error;
    setProjects((projectResult.data ?? []) as Project[]);
    setControls((controlResult.data ?? []) as unknown as Control[]);
    setLinks((linkResult.data ?? []) as unknown as LinkRow[]);
    setTreatments((treatmentResult.data ?? []) as GapTreatment[]);
    if (!projectRequirementResult.error) {
      setRequirementCoverage((projectRequirementResult.data ?? []).map((row) => row.coverage_type as CoverageType));
    }
    if (!requirementControlResult.error) {
      type RawLink = { requirement_id: number; control_id: number; coverage_type: CoverageType; controls: { evidence_status: string; verification_status: string } | { evidence_status: string; verification_status: string }[] | null };
      const rows = (requirementControlResult.data ?? []) as unknown as RawLink[];
      setRequirementControlLinks(
        rows.map((row) => {
          const control = Array.isArray(row.controls) ? row.controls[0] : row.controls;
          return { requirement_id: row.requirement_id, control_id: row.control_id, coverage_type: row.coverage_type, evidence_status: control?.evidence_status ?? "not_uploaded", verification_status: control?.verification_status ?? "not_verified" };
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

  const linkedFor = (projectId: number) => links.filter((link) => link.project_id === projectId);
  const treatmentsFor = (projectId: number) => treatments.filter((item) => item.project_id === projectId);

  const requirementStats = useMemo(
    () => requirementRollup(requirementCoverage, requirementControlLinks),
    [requirementCoverage, requirementControlLinks],
  );

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

  const selectedLinks = useMemo(
    () => (selected ? links.filter((link) => link.project_id === selected.id) : []),
    [links, selected],
  );
  const availableControls = useMemo(() => {
    if (!selected || !controlSearch.trim()) return [];
    const linkedIds = new Set(selectedLinks.map((link) => link.control_id));
    const needle = controlSearch.trim().toLocaleLowerCase("ar");
    return controls
      .filter((control) => {
        const framework = frameworkOf(control.frameworks)?.code ?? "";
        return (
          !linkedIds.has(control.id) &&
          `${framework} ${control.control_code} ${control.title_ar}`
            .toLocaleLowerCase("ar")
            .includes(needle)
        );
      })
      .slice(0, 12);
  }, [controls, controlSearch, selected, selectedLinks]);

  function startCreate() {
    setSelected(null);
    setForm(emptyForm);
    setControlSearch("");
    setOpen(true);
    setMessage("");
  }

  function openProject(project: Project) {
    setSelected(project);
    setForm({
      project_code: project.project_code,
      name_ar: project.name_ar,
      planned_year: project.planned_year,
      planned_quarter: project.planned_quarter,
      status: project.status,
      priority: project.priority,
      executive_owner: project.executive_owner ?? "",
      solution_scope: project.solution_scope ?? "",
      target_outcome: project.target_outcome ?? "",
      recommended_technologies: project.recommended_technologies ?? "",
      planned_start_date: project.planned_start_date ?? "",
      actual_start_date: project.actual_start_date ?? "",
      target_end_date: project.target_end_date ?? "",
      forecast_end_date: project.forecast_end_date ?? "",
      progress_percent: Number(project.progress_percent) || 0,
      notes: project.notes ?? "",
    });
    setControlSearch("");
    setGapTitle("");
    setRecommendation("");
    setTreatmentType("technology");
    setTreatmentPriority("medium");
    setOpen(true);
    setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { user } = await requireProfile(["admin", "cybersecurity_team"]);
      const payload = {
        ...form,
        executive_owner: form.executive_owner || null,
        solution_scope: form.solution_scope || null,
        target_outcome: form.target_outcome || null,
        recommended_technologies: form.recommended_technologies || null,
        planned_start_date: form.planned_start_date || null,
        actual_start_date: form.actual_start_date || null,
        target_end_date: form.target_end_date || null,
        forecast_end_date: form.forecast_end_date || null,
        notes: form.notes || null,
        progress_percent: Number(form.progress_percent),
        updated_at: new Date().toISOString(),
      };
      if (selected) {
        const result = await supabase.from("cybersecurity_projects").update(payload).eq("id", selected.id).select("*").single();
        if (result.error) throw result.error;
        setSelected(result.data as Project);
        setMessage("تم حفظ بيانات المشروع في المصدر الرئيسي.");
      } else {
        const result = await supabase.from("cybersecurity_projects").insert({ ...payload, created_by: user.id }).select("*").single();
        if (result.error) throw result.error;
        setSelected(result.data as Project);
        setMessage("تم إنشاء المشروع. يمكنك الآن ربط الضوابط الفعلية به.");
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ المشروع.");
    } finally {
      setSaving(false);
    }
  }

  async function addControlLink(controlId: number) {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const { user } = await requireProfile(["admin", "cybersecurity_team"]);
      const { error: linkError } = await supabase.from("cybersecurity_project_controls").insert({
        project_id: selected.id,
        control_id: controlId,
        relationship_type: "coverage",
        created_by: user.id,
      });
      if (linkError) throw linkError;
      await load();
      setControlSearch("");
      setMessage("تم ربط الضابط بالمشروع. هذا الربط لا يغيّر حالة التزام الضابط.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر ربط الضابط.");
    } finally {
      setSaving(false);
    }
  }

  async function removeControlLink(controlId: number) {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const { error: unlinkError } = await supabase
        .from("cybersecurity_project_controls")
        .delete()
        .eq("project_id", selected.id)
        .eq("control_id", controlId);
      if (unlinkError) throw unlinkError;
      await load();
      setMessage("تم إلغاء ربط الضابط بالمشروع.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إلغاء ربط الضابط.");
    } finally {
      setSaving(false);
    }
  }

  async function addTreatment() {
    if (!selected || !gapTitle.trim() || !recommendation.trim()) return;
    setSaving(true);
    setError("");
    try {
      const { user } = await requireProfile(["admin", "cybersecurity_team"]);
      const { error: treatmentError } = await supabase.from("cybersecurity_project_gap_treatments").insert({
        project_id: selected.id,
        gap_title: gapTitle.trim(),
        treatment_type: treatmentType,
        recommendation: recommendation.trim(),
        priority: treatmentPriority,
        created_by: user.id,
      });
      if (treatmentError) throw treatmentError;
      await load();
      setGapTitle("");
      setRecommendation("");
      setMessage("تمت إضافة معالجة الفجوة. لا تتغير حالة الالتزام إلا بعد الدليل والمراجعة.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إضافة معالجة الفجوة.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTreatment(id: number) {
    setSaving(true);
    const { error: removeError } = await supabase.from("cybersecurity_project_gap_treatments").delete().eq("id", id);
    if (removeError) setError("تعذر حذف معالجة الفجوة.");
    else {
      await load();
      setMessage("تم حذف معالجة الفجوة.");
    }
    setSaving(false);
  }

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحميل سجل المشاريع…</p></main>;
  }

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
            <span>المشروع</span><span>المالك</span><span>الحالة</span><span>الأولوية</span><span>الإنجاز</span><span>الموعد المستهدف</span><span>الضوابط</span><span aria-hidden="true" />
          </div>
          {filteredProjects.map((project) => {
            const projectLinks = linkedFor(project.id);
            const delayed = isDelayed(project, getRiyadhDate());
            return (
              <article key={project.id} className={delayed ? "is-delayed" : ""}>
                <div className="project-register-name"><b dir="ltr">{project.project_code}</b><strong>{project.name_ar}</strong><small>{project.planned_year} · {project.planned_quarter}</small></div>
                <span>{project.executive_owner || "غير محدد"}</span>
                <span className={`roadmap-status ${project.status}`}>{statusText[project.status]}</span>
                <span className={`register-priority ${project.priority}`}>{priorityText[project.priority]}</span>
                <div className="register-progress"><b>{Number(project.progress_percent)}%</b><i><span style={{ width: `${Math.max(0, Math.min(100, Number(project.progress_percent)))}%` }} /></i></div>
                <span className={delayed ? "register-date delayed" : "register-date"}>{project.target_end_date || "غير محدد"}{delayed && <small>متأخر</small>}</span>
                <span>{projectLinks.length} مرتبط</span>
                <span><Link href={`/roadmap/${project.id}`}>صفحة المشروع ←</Link> · <button type="button" onClick={() => openProject(project)}>عرض وإدارة ←</button></span>
              </article>
            );
          })}
          {!filteredProjects.length && <p className="roadmap-empty">لا توجد مشاريع مطابقة للفلاتر الحالية.</p>}
        </section>

        <aside className="register-integrity-note">
          <div><strong>تعريف التغطية</strong><p>الضابط المرتبط هنا مستهدف بمشروع معالجة، ولا يصبح ممتثلًا إلا بعد رفع الدليل ومراجعته والتحقق منه.</p></div>
          <Link href="/controls">فتح سجل الضوابط ←</Link>
        </aside>
      </section>

      {open && (
        <div className="roadmap-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="roadmap-dialog project-register-dialog" role="dialog" aria-modal="true" aria-labelledby="roadmap-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span>{selected ? "بيانات المشروع" : "إضافة مشروع"}</span><h2 id="roadmap-dialog-title">{selected?.name_ar || "مبادرة سيبرانية جديدة"}</h2></div><button aria-label="إغلاق" onClick={() => setOpen(false)}>×</button></header>

            <form onSubmit={save} className="roadmap-form">
              <h3 className="roadmap-form-section">المعلومات الأساسية</h3>
              <label>رمز المشروع<input required dir="ltr" disabled={Boolean(selected)} value={form.project_code} onChange={(event) => setForm({ ...form, project_code: event.target.value.toUpperCase() })} placeholder="R-12" /></label>
              <label>اسم المشروع<input required value={form.name_ar} onChange={(event) => setForm({ ...form, name_ar: event.target.value })} /></label>
              <label>السنة<select value={form.planned_year} onChange={(event) => setForm({ ...form, planned_year: Number(event.target.value) })}>{[2027, 2028, 2029].map((year) => <option key={year}>{year}</option>)}</select></label>
              <label>الربع<select value={form.planned_quarter} onChange={(event) => setForm({ ...form, planned_quarter: event.target.value })}>{["Q1", "Q2", "Q3", "Q4"].map((quarter) => <option key={quarter}>{quarter}</option>)}</select></label>
              <label>الحالة<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Project["status"] })}>{Object.entries(statusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>الأولوية الإدارية<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Project["priority"] })}>{Object.entries(priorityText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>مالك التنفيذ<input value={form.executive_owner} onChange={(event) => setForm({ ...form, executive_owner: event.target.value })} /></label>
              <label>نسبة الإنجاز<input type="number" min="0" max="100" value={form.progress_percent} onChange={(event) => setForm({ ...form, progress_percent: Number(event.target.value) })} /></label>

              <h3 className="roadmap-form-section">الجدول الزمني</h3>
              <label>تاريخ البدء المخطط<input type="date" value={form.planned_start_date} onChange={(event) => setForm({ ...form, planned_start_date: event.target.value })} /></label>
              <label>التاريخ المستهدف<input type="date" value={form.target_end_date} onChange={(event) => setForm({ ...form, target_end_date: event.target.value })} /></label>
              <label>تاريخ البدء الفعلي<input type="date" value={form.actual_start_date} onChange={(event) => setForm({ ...form, actual_start_date: event.target.value })} /></label>
              <label>تاريخ الإنجاز المتوقع<input type="date" value={form.forecast_end_date} onChange={(event) => setForm({ ...form, forecast_end_date: event.target.value })} /></label>

              <h3 className="roadmap-form-section">النطاق والنتائج</h3>
              <label className="wide">نطاق الحلول<textarea rows={2} value={form.solution_scope} onChange={(event) => setForm({ ...form, solution_scope: event.target.value })} /></label>
              <label className="wide">الناتج المستهدف<textarea rows={2} value={form.target_outcome} onChange={(event) => setForm({ ...form, target_outcome: event.target.value })} /></label>
              <label className="wide">تقنيات مرشحة لإغلاق الفجوات<textarea rows={2} value={form.recommended_technologies} onChange={(event) => setForm({ ...form, recommended_technologies: event.target.value })} /></label>
              <label className="wide">ملاحظات<textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
              <footer><button type="button" onClick={() => setOpen(false)}>إغلاق</button>{canManage && <button className="roadmap-primary" disabled={saving}>{saving ? "جاري الحفظ…" : "حفظ المشروع"}</button>}</footer>
            </form>

            {selected && (
              <section className="project-control-links">
                <header><div><span>المصدر الرسمي للربط</span><h3>الضوابط الفرعية المستهدفة</h3><p>يُحفظ الربط في جدول العلاقات ويُستخدم تلقائيًا في التحليل وخارطة الطريق.</p></div><b>{selectedLinks.length} ضابط</b></header>
                <div className="project-linked-controls">
                  {selectedLinks.length ? selectedLinks.map((link) => {
                    const control = controlOf(link.controls);
                    const framework = frameworkOf(control?.frameworks)?.code;
                    return control ? <article key={link.control_id}><div><b dir="ltr">{framework} · {control.control_code}</b><span>{control.title_ar}</span></div>{canManage && <button type="button" disabled={saving} onClick={() => removeControlLink(link.control_id)} aria-label={`إلغاء ربط ${control.control_code}`}>×</button>}</article> : null;
                  }) : <p className="roadmap-empty">لا توجد ضوابط مرتبطة فعليًا بهذا المشروع.</p>}
                </div>
                {canManage && <div className="control-link-search"><label><span>ابحث برقم الضابط أو اسمه</span><input value={controlSearch} onChange={(event) => setControlSearch(event.target.value)} placeholder="مثال: ECC 2-2-1 أو إدارة الهوية" /></label>{controlSearch.trim() && <div className="control-search-results">{availableControls.map((control) => { const framework = frameworkOf(control.frameworks)?.code; return <button type="button" key={control.id} disabled={saving} onClick={() => addControlLink(control.id)}><b dir="ltr">{framework} · {control.control_code}</b><span>{control.title_ar}</span><strong>+ ربط</strong></button>; })}{!availableControls.length && <p>لا توجد نتائج غير مرتبطة.</p>}</div>}</div>}
              </section>
            )}

            {selected && (
              <section className="roadmap-treatments">
                <header><div><span>خطة إغلاق الفجوات</span><h3>الفجوات والمعالجات المقترحة</h3><p>المعالجة لا تغيّر حالة الالتزام إلا بعد اكتمال الدليل والمراجعة.</p></div></header>
                {canManage && <div className="roadmap-treatment-form"><input value={gapTitle} onChange={(event) => setGapTitle(event.target.value)} placeholder="وصف الفجوة" /><select value={treatmentType} onChange={(event) => setTreatmentType(event.target.value as GapTreatment["treatment_type"])}>{Object.entries(treatmentText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={treatmentPriority} onChange={(event) => setTreatmentPriority(event.target.value as GapTreatment["priority"])}>{Object.entries(priorityText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><textarea value={recommendation} onChange={(event) => setRecommendation(event.target.value)} placeholder="التقنية أو الإجراء المقترح لإغلاق الفجوة" /><button className="roadmap-primary" type="button" disabled={saving || !gapTitle.trim() || !recommendation.trim()} onClick={addTreatment}>إضافة معالجة</button></div>}
                <div className="roadmap-treatment-list">{treatmentsFor(selected.id).length ? treatmentsFor(selected.id).map((item) => <article key={item.id}><div><b>{item.gap_title}</b><p>{item.recommendation}</p></div><aside><span className={`roadmap-type ${item.treatment_type}`}>{treatmentText[item.treatment_type]}</span><small>{priorityText[item.priority]} الأولوية</small>{canManage && <button type="button" onClick={() => removeTreatment(item.id)} aria-label="حذف معالجة الفجوة">×</button>}</aside></article>) : <p className="roadmap-empty">لم تسجل معالجات فجوات لهذا المشروع بعد.</p>}</div>
              </section>
            )}
          </section>
        </div>
      )}
    <AssessmentFindingLinks/></main>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return <article className={`roadmap-metric ${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}
