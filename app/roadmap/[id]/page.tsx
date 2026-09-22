"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import StatusBadge from "@/components/StatusBadge";
import GrcAuditTrail from "@/components/GrcAuditTrail";
import { formatDateAr } from "../portfolio-metrics";
import "../roadmap.css";
import "@/app/controls/[id]/detail.css";

type Project = {
  id: number;
  project_code: string;
  name_ar: string;
  description_ar: string | null;
  status: string;
  priority: string;
  initiative_type: string;
  executive_owner: string | null;
  progress_percent: number;
  planned_year: number;
  planned_quarter: string;
  target_end_date: string | null;
  recommended_technologies: string | null;
};

type GapTreatment = {
  id: number;
  project_id: number;
  gap_title: string;
  treatment_type: "technology" | "procedure" | "policy" | "training";
  recommendation: string;
  priority: "high" | "medium" | "low";
};

type Requirement = { id: number; requirement_code: string; title_ar: string; status: string };
type ProjectRequirement = {
  project_id: number;
  requirement_id: number;
  coverage_type: "full" | "partial" | "supporting";
  cybersecurity_requirements: Requirement | Requirement[] | null;
};
type ControlRow = {
  id: number;
  control_code: string;
  title_ar: string;
  implementation_status: string;
  evidence_status: string;
  verification_status: string;
  frameworks: { code: string } | { code: string }[] | null;
};
type RequirementControl = {
  requirement_id: number;
  control_id: number;
  coverage_type: "full" | "partial" | "supporting";
  mapping_confidence: "confirmed" | "probable";
  controls: ControlRow | ControlRow[] | null;
};

const tabs = ["نظرة عامة", "المتطلبات", "الضوابط", "الأدلة", "المعالجات", "سجل التدقيق"];
const treatmentText: Record<string, string> = {
  technology: "تقنية",
  procedure: "إجراء",
  policy: "وثيقة/سياسة",
  training: "تدريب",
};
const initiativeTypeText: Record<string, string> = {
  technology_project: "مشروع تقني",
  managed_service: "خدمة مُدارة",
  framework_agreement: "اتفاقية إطارية",
  internal_program: "برنامج داخلي",
  policy_governance: "سياسة وحوكمة",
  assessment: "تقييم",
  continuous_activity: "نشاط مستمر",
};
const coverageText: Record<string, string> = { full: "كاملة", partial: "جزئية", supporting: "داعمة" };
const statusText: Record<string, string> = { planned: "مخطط", in_progress: "قيد التنفيذ", on_hold: "متوقف", completed: "مكتمل" };
const priorityText: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const mappingConfidenceText: Record<string, string> = { confirmed: "مؤكد", probable: "محتمل" };
const verificationFilterText: Record<string, string> = { verified: "تم التحقق", not_verified: "غير متحقق" };
const goodVerification = (value: string) => value === "verified";
const single = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [projectRequirements, setProjectRequirements] = useState<ProjectRequirement[]>([]);
  const [requirementControls, setRequirementControls] = useState<RequirementControl[]>([]);
  const [treatments, setTreatments] = useState<GapTreatment[]>([]);
  const [role, setRole] = useState<UserRole>("control_owner");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState(0);
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [coverageFilter, setCoverageFilter] = useState("all");
  const [verificationFilter, setVerificationFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [gapTitle, setGapTitle] = useState("");
  const [treatmentType, setTreatmentType] = useState<GapTreatment["treatment_type"]>("technology");
  const [recommendation, setRecommendation] = useState("");
  const [treatmentPriority, setTreatmentPriority] = useState<GapTreatment["priority"]>("medium");
  const [technologies, setTechnologies] = useState("");
  const canManage = role === "admin" || role === "cybersecurity_team";

  async function loadTreatments(projectId: number) {
    const result = await supabase
      .from("cybersecurity_project_gap_treatments")
      .select("id,project_id,gap_title,treatment_type,recommendation,priority")
      .eq("project_id", projectId)
      .order("id");
    if (!result.error) setTreatments((result.data ?? []) as GapTreatment[]);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { profile } = await requireProfile();
        if (!active) return;
        setRole(profile.role);
        const projectId = Number(id);
        if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error("رقم المشروع غير صحيح.");
        const [p, pr] = await Promise.all([
          supabase.from("cybersecurity_projects").select("*").eq("id", projectId).single(),
          supabase
            .from("cybersecurity_project_requirements")
            .select("project_id,requirement_id,coverage_type,cybersecurity_requirements(id,requirement_code,title_ar,status)")
            .eq("project_id", projectId),
        ]);
        if (p.error || !p.data) throw new Error("المشروع غير موجود أو ليس ضمن صلاحيتك.");
        if (pr.error) throw new Error("تعذر تحميل متطلبات المشروع.");
        if (!active) return;
        setProject(p.data as Project);
        setTechnologies((p.data as Project).recommended_technologies ?? "");
        const rows = (pr.data ?? []) as unknown as ProjectRequirement[];
        setProjectRequirements(rows);
        await loadTreatments(projectId);
        const requirementIds = rows.map((row) => row.requirement_id);
        if (requirementIds.length) {
          const [rc, activeControlResult] = await Promise.all([
            supabase
              .from("cybersecurity_requirement_controls")
              .select("requirement_id,control_id,coverage_type,mapping_confidence,controls(id,control_code,title_ar,implementation_status,evidence_status,verification_status,frameworks(code))")
              .in("requirement_id", requirementIds),
            supabase.from("controls").select("id,frameworks!inner(is_active)").eq("frameworks.is_active",true),
          ]);
          if (rc.error) throw new Error("تعذر تحميل الضوابط المشتقة من المتطلبات.");
          if (activeControlResult.error) throw new Error("تعذر التحقق من الضوابط النشطة.");
          const activeIds = new Set((activeControlResult.data ?? []).map(row => row.id));
          if (active) setRequirementControls((rc.data ?? []).filter(row => activeIds.has(row.control_id)) as unknown as RequirementControl[]);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "تعذر التحميل");
        const { data } = await supabase.auth.getSession();
        if (!data.session) router.replace("/login");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, router]);

  async function addTreatment() {
    if (!project || !gapTitle.trim() || !recommendation.trim()) return;
    setSaving(true);
    setActionError("");
    try {
      const { user } = await requireProfile(["admin", "cybersecurity_team"]);
      const { error: treatmentError } = await supabase.from("cybersecurity_project_gap_treatments").insert({
        project_id: project.id,
        gap_title: gapTitle.trim(),
        treatment_type: treatmentType,
        recommendation: recommendation.trim(),
        priority: treatmentPriority,
        created_by: user.id,
      });
      if (treatmentError) throw treatmentError;
      await loadTreatments(project.id);
      setGapTitle("");
      setRecommendation("");
      setMessage("تمت إضافة معالجة الفجوة. لا تتغير حالة الالتزام إلا بعد الدليل والمراجعة.");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "تعذر إضافة معالجة الفجوة.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTreatment(treatmentId: number) {
    if (!project) return;
    setSaving(true);
    const { error: removeError } = await supabase.from("cybersecurity_project_gap_treatments").delete().eq("id", treatmentId);
    if (removeError) setActionError("تعذر حذف معالجة الفجوة.");
    else {
      await loadTreatments(project.id);
      setMessage("تم حذف معالجة الفجوة.");
    }
    setSaving(false);
  }

  async function saveTechnologies() {
    if (!project) return;
    setSaving(true);
    setActionError("");
    try {
      await requireProfile(["admin", "cybersecurity_team"]);
      const { error: updateError } = await supabase
        .from("cybersecurity_projects")
        .update({ recommended_technologies: technologies || null, updated_at: new Date().toISOString() })
        .eq("id", project.id);
      if (updateError) throw updateError;
      setProject({ ...project, recommended_technologies: technologies || null });
      setMessage("تم حفظ التقنيات المرشحة.");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "تعذر حفظ التقنيات المرشحة.");
    } finally {
      setSaving(false);
    }
  }

  const requirementsWithStats = useMemo(
    () =>
      projectRequirements.map((pr) => {
        const requirement = single(pr.cybersecurity_requirements);
        const links = requirementControls.filter((rc) => rc.requirement_id === pr.requirement_id);
        const verifiedCount = links.filter((rc) => {
          const control = single(rc.controls);
          return control && goodVerification(control.verification_status);
        }).length;
        const confirmedCount = links.filter((rc) => rc.mapping_confidence === "confirmed").length;
        const probableCount = links.filter((rc) => rc.mapping_confidence === "probable").length;
        // A requirement with zero linked controls is "Unresolved" (Needs Control Mapping) —
        // derived live from the junction table, never a stored/guessed status. It is excluded
        // from Verified Controls / Compliance Contribution / Coverage below simply because it
        // contributes no controls to those pools.
        const mappingStatus: "mapped" | "unresolved" = links.length === 0 ? "unresolved" : "mapped";
        return { requirement, coverage: pr.coverage_type, controlsCount: links.length, verifiedCount, confirmedCount, probableCount, mappingStatus };
      }),
    [projectRequirements, requirementControls],
  );

  const derivedControls = useMemo(() => {
    const rows: Array<{ requirementCode: string; coverage: "full" | "partial" | "supporting"; mappingConfidence: "confirmed" | "probable"; control: ControlRow }> = [];
    for (const rc of requirementControls) {
      const control = single(rc.controls);
      if (!control) continue;
      const requirement = requirementsWithStats.find((item) => item.requirement?.id === rc.requirement_id)?.requirement;
      rows.push({ requirementCode: requirement?.requirement_code ?? "—", coverage: rc.coverage_type, mappingConfidence: rc.mapping_confidence, control });
    }
    return rows;
  }, [requirementControls, requirementsWithStats]);

  const uniqueControls = useMemo(() => {
    const seen = new Map<number, ControlRow>();
    for (const row of derivedControls) if (!seen.has(row.control.id)) seen.set(row.control.id, row.control);
    return Array.from(seen.values());
  }, [derivedControls]);

  const controlFrameworks = useMemo(() => {
    const set = new Set<string>();
    for (const row of derivedControls) {
      const fw = single(row.control.frameworks)?.code;
      if (fw) set.add(fw);
    }
    return Array.from(set).sort();
  }, [derivedControls]);

  const filteredControlRows = useMemo(
    () =>
      derivedControls.filter((row) => {
        const fw = single(row.control.frameworks)?.code;
        return (
          (frameworkFilter === "all" || fw === frameworkFilter) &&
          (coverageFilter === "all" || row.coverage === coverageFilter) &&
          (verificationFilter === "all" || row.control.verification_status === verificationFilter)
        );
      }),
    [derivedControls, frameworkFilter, coverageFilter, verificationFilter],
  );

  const rollup = useMemo(() => {
    // Full/Partial/Supporting is a breakdown of the LINKED CONTROLS by
    // requirement<->control coverage_type — not the project<->requirement
    // coverage (which is a separate, usually coarser, single value per
    // requirement). One control can appear once per requirement it serves;
    // dedupe by control id so a control isn't double-counted.
    const seenForCoverage = new Set<number>();
    const coverageRows = derivedControls.filter((row) => {
      if (seenForCoverage.has(row.control.id)) return false;
      seenForCoverage.add(row.control.id);
      return true;
    });
    const full = coverageRows.filter((row) => row.coverage === "full").length;
    const partial = coverageRows.filter((row) => row.coverage === "partial").length;
    const supporting = coverageRows.filter((row) => row.coverage === "supporting").length;
    const readyForVerification = uniqueControls.filter((c) => c.evidence_status === "accepted" && c.verification_status !== "verified").length;
    const verified = uniqueControls.filter((c) => goodVerification(c.verification_status)).length;
    const contribution = uniqueControls.length ? Math.round((verified / uniqueControls.length) * 100) : null;
    // Confirmed/Probable is a mapping-QUALITY signal (does an official control text
    // directly support this link, from the Phase 2 reconciliation) — a separate axis
    // from Full/Partial/Supporting (coverage completeness). Dedupe by control id.
    const confirmedMappings = coverageRows.filter((row) => row.mappingConfidence === "confirmed").length;
    const probableMappings = coverageRows.length - confirmedMappings;
    const requirementsWithoutMapping = requirementsWithStats.filter((item) => item.mappingStatus === "unresolved").length;
    return {
      requirementsCount: projectRequirements.length,
      totalControls: uniqueControls.length,
      full,
      partial,
      supporting,
      readyForVerification,
      verified,
      contribution,
      confirmedMappings,
      probableMappings,
      requirementsWithoutMapping,
    };
  }, [projectRequirements, uniqueControls, derivedControls, requirementsWithStats]);

  if (loading) return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحميل المشروع…</p></main>;
  if (error || !project) return <main className="roadmap-page" dir="rtl"><p role="alert">{error}</p><Link href="/roadmap">العودة إلى سجل المشاريع</Link></main>;

  const clampedProgress = Math.max(0, Math.min(100, Number(project.progress_percent) || 0));
  const coverageTotal = rollup.full + rollup.partial + rollup.supporting;
  const coveragePct = (n: number) => (coverageTotal ? Math.round((n / coverageTotal) * 100) : 0);

  return (
    <main className="roadmap-page" dir="rtl">
      <section className="roadmap-shell">
        <Link className="detail-back" href="/roadmap">← العودة إلى سجل المشاريع</Link>

        {actionError && <p className="roadmap-alert" role="alert">{actionError}</p>}
        {message && <p className="roadmap-message" role="status">{message}</p>}

        <header className="project-detail-head">
          <h1>{project.name_ar}</h1>
          <p className="project-detail-tags">
            <span dir="ltr">{project.project_code}</span> · {initiativeTypeText[project.initiative_type] ?? project.initiative_type} · {statusText[project.status] ?? project.status} · أولوية {priorityText[project.priority] ?? project.priority}
          </p>
          <p className="project-detail-line">
            {project.planned_year} · {project.planned_quarter} <span className="sep">|</span> المالك: {project.executive_owner || "غير محدد"} <span className="sep">|</span> الإنجاز: {clampedProgress}%
          </p>
          <div className="project-detail-progress"><i style={{ width: `${clampedProgress}%` }} /></div>
        </header>

        <section className="project-kpi-row" aria-label="مؤشرات المشروع الأساسية">
          <article className="project-kpi">
            <span>المتطلبات</span>
            <strong>{rollup.requirementsCount}</strong>
          </article>
          <article className="project-kpi">
            <span>الضوابط المرتبطة</span>
            <strong>{rollup.totalControls}</strong>
          </article>
          <article className="project-kpi" title="Confirmed mappings — ربط مدعوم مباشرة بنص ضابط رسمي">
            <span>الربط المؤكد</span>
            <strong>{rollup.confirmedMappings}</strong>
          </article>
          <article className="project-kpi">
            <span>جاهزة للتحقق</span>
            <strong>{rollup.readyForVerification}</strong>
          </article>
          <article className="project-kpi project-kpi-contribution">
            <span>مساهمة الامتثال</span>
            <strong>{rollup.contribution === null ? "—" : `${rollup.contribution}%`}</strong>
            <small>{rollup.verified} من {rollup.totalControls} ضوابط متحققة</small>
            <div className="project-kpi-progress"><i style={{ width: `${rollup.contribution ?? 0}%` }} /></div>
          </article>
        </section>
        <p className="detail-hint">نسبة المساهمة محسوبة لحظيًا من حالة التحقق الفعلية للضوابط المرتبطة — إنجاز المشروع لا يعني امتثال الضابط.</p>

        <section className="project-summary-grid">
          <article className="coverage-summary-card">
            <header><h2>تغطية الضوابط</h2></header>
            <div className="coverage-seg-bar" role="img" aria-label={`تغطية كاملة ${rollup.full}، جزئية ${rollup.partial}، داعمة ${rollup.supporting}`}>
              {coverageTotal ? (
                <>
                  <i className="seg-full" style={{ width: `${coveragePct(rollup.full)}%` }} />
                  <i className="seg-partial" style={{ width: `${coveragePct(rollup.partial)}%` }} />
                  <i className="seg-supporting" style={{ width: `${coveragePct(rollup.supporting)}%` }} />
                </>
              ) : (
                <i className="seg-empty" style={{ width: "100%" }} />
              )}
            </div>
            <ul className="coverage-legend">
              <li><span className="legend-dot full" />تغطية كاملة: <b>{rollup.full}</b></li>
              <li><span className="legend-dot partial" />تغطية جزئية: <b>{rollup.partial}</b></li>
              <li><span className="legend-dot supporting" />تغطية داعمة: <b>{rollup.supporting}</b></li>
            </ul>
          </article>

          <article className="mapping-quality-card">
            <header><h2>جودة الربط</h2></header>
            <ul>
              <li className="mq-confirmed" title="Confirmed — دعمها نص ضابط رسمي مباشرة، من تصنيف Phase 2 المعتمد">
                <span className="legend-dot confirmed" />ربط مؤكد: <b>{rollup.confirmedMappings}</b>
              </li>
              <li className="mq-probable" title="Probable — احتمالي، ولا يُعتمد بمفرده كدليل امتثال رسمي">
                <span className="legend-dot probable" />ربط محتمل: <b>{rollup.probableMappings}</b>
              </li>
              <li className="mq-unresolved" title="لا يوجد ضابط رسمي موثوق مرتبط بعد؛ غير محسوب ضمن الامتثال">
                <span className="legend-dot unresolved" />يحتاج ربط ضابط: <b>{rollup.requirementsWithoutMapping}</b>
              </li>
            </ul>
          </article>
        </section>

        <div className="detail-tabs" role="tablist" aria-label="تفاصيل المشروع">
          {tabs.map((label, index) => (
            <button key={label} role="tab" aria-selected={tab === index} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)}>
              {label}
            </button>
          ))}
        </div>

        <section className="detail-columns">
          <div className="detail-content">
            {tab === 0 && (
              <section className="detail-card">
                <h2>نظرة عامة</h2>
                <p>الحالة: {statusText[project.status] ?? project.status} · الأولوية: {priorityText[project.priority] ?? project.priority}</p>
                <p>المالك التنفيذي: {project.executive_owner || "غير محدد"}</p>
                <p>نسبة الإنجاز: {clampedProgress}% · الموعد المستهدف: <span dir="ltr">{formatDateAr(project.target_end_date)}</span></p>
                <p>{project.description_ar || "لا يوجد وصف مسجل."}</p>
              </section>
            )}

            {tab === 1 && (
              <section className="requirements-tab">
                {!requirementsWithStats.length && <p className="roadmap-empty">لا توجد متطلبات مرتبطة بهذا المشروع بعد.</p>}
                {requirementsWithStats.map(
                  (item) =>
                    item.requirement && (
                      <article className="requirement-card" key={item.requirement.id}>
                        <header>
                          <h3><span dir="ltr">{item.requirement.requirement_code}</span> — {item.requirement.title_ar}</h3>
                          {item.mappingStatus === "mapped" && (
                            <span className="requirement-coverage-tag">تغطية المشروع: {coverageText[item.coverage] ?? item.coverage}</span>
                          )}
                        </header>
                        {item.mappingStatus === "unresolved" ? (
                          <p className="requirement-warning">
                            <StatusBadge status="needs_control_mapping" /> لا يوجد ضابط رسمي موثوق مرتبط بهذا المتطلب بعد — غير محسوب ضمن الضوابط المُتحقَّقة أو نسبة المساهمة أو تغطية الضوابط.
                          </p>
                        ) : (
                          <p className="requirement-stats">
                            {item.controlsCount} ضوابط مرتبطة · {item.confirmedCount} ربط مؤكد · {item.probableCount} ربط محتمل
                            <br />
                            التحقق: {item.verifiedCount}/{item.controlsCount}
                          </p>
                        )}
                      </article>
                    ),
                )}
              </section>
            )}

            {tab === 2 && (
              <section className="controls-tab">
                <div className="controls-table-filters">
                  <label>
                    <span>الإطار</span>
                    <select value={frameworkFilter} onChange={(event) => setFrameworkFilter(event.target.value)}>
                      <option value="all">الكل</option>
                      {controlFrameworks.map((fw) => <option key={fw} value={fw}>{fw}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>التغطية</span>
                    <select value={coverageFilter} onChange={(event) => setCoverageFilter(event.target.value)}>
                      <option value="all">الكل</option>
                      {Object.entries(coverageText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>التحقق</span>
                    <select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value)}>
                      <option value="all">الكل</option>
                      {Object.entries(verificationFilterText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="controls-table-wrap">
                  <table className="controls-table">
                    <thead>
                      <tr>
                        <th>الإطار</th>
                        <th>الضابط</th>
                        <th>التغطية</th>
                        <th>جودة الربط</th>
                        <th>التطبيق</th>
                        <th>الدليل</th>
                        <th>التحقق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredControlRows.map((row, index) => {
                        const framework = single(row.control.frameworks);
                        return (
                          <tr key={`${row.control.id}-${index}`}>
                            <td dir="ltr">{framework?.code ?? "—"}</td>
                            <td>
                              <Link href={`/controls/${row.control.id}`}>
                                <span dir="ltr">{row.control.control_code}</span> — {row.control.title_ar}
                              </Link>
                            </td>
                            <td><span className={`coverage-pill ${row.coverage}`}>{coverageText[row.coverage] ?? row.coverage}</span></td>
                            <td><span className={`mapping-pill ${row.mappingConfidence}`}>{mappingConfidenceText[row.mappingConfidence] ?? row.mappingConfidence}</span></td>
                            <td><StatusBadge status={row.control.implementation_status} /></td>
                            <td><StatusBadge status={row.control.evidence_status} /></td>
                            <td><StatusBadge status={row.control.verification_status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!filteredControlRows.length && <p className="roadmap-empty">لا توجد ضوابط مطابقة للفلاتر الحالية.</p>}
                </div>
              </section>
            )}

            {tab === 3 && (
              <section className="detail-card">
                <h2>الأدلة</h2>
                <p className="detail-hint">يُستخدم سجل الأدلة والمراجعة الحالي كما هو — لا مسار رفع أو مراجعة جديد هنا. افتح الضابط لإدارة دليله.</p>
                {!uniqueControls.length ? (
                  <p className="roadmap-empty">لا توجد أدلة مرتبطة بضوابط هذا المشروع حتى الآن.</p>
                ) : (
                  uniqueControls.map((control) => (
                    <article className="control-evidence-item" key={control.id}>
                      <b dir="ltr">{control.control_code}</b> — {control.title_ar}
                      <p>حالة الدليل: <StatusBadge status={control.evidence_status} /></p>
                      <Link className="detail-back" href={`/controls/${control.id}`}>فتح الأدلة والمراجعة ←</Link>
                    </article>
                  ))
                )}
              </section>
            )}

            {tab === 4 && (
              <section className="roadmap-treatments">
                <header>
                  <div>
                    <span>خطة إغلاق الفجوات</span>
                    <h3>الفجوات والمعالجات المقترحة</h3>
                    <p>المعالجة لا تغيّر حالة الالتزام إلا بعد اكتمال الدليل والمراجعة.</p>
                  </div>
                </header>
                {canManage && (
                  <div className="roadmap-treatment-form">
                    <input value={gapTitle} onChange={(event) => setGapTitle(event.target.value)} placeholder="وصف الفجوة" />
                    <select value={treatmentType} onChange={(event) => setTreatmentType(event.target.value as GapTreatment["treatment_type"])}>
                      {Object.entries(treatmentText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select value={treatmentPriority} onChange={(event) => setTreatmentPriority(event.target.value as GapTreatment["priority"])}>
                      {Object.entries(priorityText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <textarea value={recommendation} onChange={(event) => setRecommendation(event.target.value)} placeholder="التقنية أو الإجراء المقترح لإغلاق الفجوة" />
                    <button className="roadmap-primary" type="button" disabled={saving || !gapTitle.trim() || !recommendation.trim()} onClick={addTreatment}>إضافة معالجة</button>
                  </div>
                )}
                <div className="roadmap-treatment-list">
                  {treatments.length ? (
                    treatments.map((item) => (
                      <article key={item.id}>
                        <div>
                          <b>{item.gap_title}</b>
                          <p>{item.recommendation}</p>
                        </div>
                        <aside>
                          <span className={`roadmap-type ${item.treatment_type}`}>{treatmentText[item.treatment_type]}</span>
                          <small>{priorityText[item.priority]} الأولوية</small>
                          {canManage && <button type="button" onClick={() => removeTreatment(item.id)} aria-label="حذف معالجة الفجوة">×</button>}
                        </aside>
                      </article>
                    ))
                  ) : (
                    <p className="roadmap-empty">لم تسجل معالجات فجوات لهذا المشروع بعد.</p>
                  )}
                </div>
                <div className="technologies-field">
                  <label>
                    <span>تقنيات مرشحة لإغلاق الفجوات</span>
                    <textarea rows={2} value={technologies} disabled={!canManage} onChange={(event) => setTechnologies(event.target.value)} placeholder="لا توجد تقنيات مسجلة بعد." />
                  </label>
                  {canManage && (
                    <button type="button" className="roadmap-secondary" disabled={saving} onClick={saveTechnologies}>حفظ التقنيات</button>
                  )}
                </div>
              </section>
            )}

            {tab === 5 && (
              <section>
                {!uniqueControls.length && <section className="detail-card"><p>لا توجد ضوابط مرتبطة، لا يوجد سجل تدقيق مرتبط بعد.</p></section>}
                {uniqueControls.map((control) => (
                  <details className="control-evidence-item" key={control.id} open={uniqueControls.length === 1}>
                    <summary dir="ltr">{control.control_code} — {control.title_ar}</summary>
                    <GrcAuditTrail controlId={control.id} />
                  </details>
                ))}
              </section>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
