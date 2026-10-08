"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { projectIdFromPath, projectReturn, projectTabs, projectView, updateStrategyQuery } from "@/lib/strategy-navigation";
import Link from "next/link";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, createReadEpoch, unavailable, noRelationship, type ReadStatus } from "@/lib/strategy-read";
import { ReadNotice, ReadSection } from "../read-state";
import StatusBadge from "@/components/StatusBadge";
import GrcAuditTrail from "@/components/GrcAuditTrail";
import { executionYearLabels, formatDuration, mappingCompletenessLabels, ownerLabels, priorityLabels, workTypeLabels, type PortfolioProject } from "@/lib/project-portfolio";
import "../roadmap.css";
import "@/app/controls/[id]/detail.css";

// Canonical QA portfolio record (lib/project-portfolio.ts) plus detail-only fields.
type Project = PortfolioProject & {
  target_outcome: string | null;
  updated_at: string | null;
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
type LegacyLink = { project_id: number; control_id: number; controls: Pick<ControlRow, "id" | "control_code" | "title_ar"> | Pick<ControlRow, "id" | "control_code" | "title_ar">[] | null };

const tabs = ["نظرة عامة", "المتطلبات", "الضوابط", "الأدلة", "المعالجات", "سجل التدقيق"];
const treatmentText: Record<string, string> = {
  technology: "تقنية",
  procedure: "إجراء",
  policy: "وثيقة/سياسة",
  training: "تدريب",
};
const coverageText: Record<string, string> = { full: "كاملة", partial: "جزئية", supporting: "داعمة" };
const statusText: Record<string, string> = { planned: "مخطط", in_progress: "قيد التنفيذ", on_hold: "متوقف", completed: "مكتمل" };
const priorityText: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const mappingConfidenceText: Record<string, string> = { confirmed: "مؤكد", probable: "محتمل" };
const verificationFilterText: Record<string, string> = { verified: "تم التحقق", not_verified: "غير متحقق" };
const ownerText = (project: Project) => project.executive_owner_code === "other" ? project.executive_owner_other : project.executive_owner_code ? ownerLabels[project.executive_owner_code] : "بانتظار التصنيف";
const goodVerification = (value: string) => value === "verified";
const single = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  // Changing path identity must not retain a previous project's data or edit drafts.
  return <Suspense fallback={<p>جاري التحميل...</p>}><ProjectDetailContent key={id} id={id} /></Suspense>;
}

function ProjectDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const returnContext = projectReturn(params);
  const [project, setProject] = useState<Project | null>(null);
  const [projectRequirements, setProjectRequirements] = useState<ProjectRequirement[]>([]);
  const [requirementControls, setRequirementControls] = useState<RequirementControl[]>([]);
  const [legacyLinks, setLegacyLinks] = useState<LegacyLink[]>([]);
  const [treatments, setTreatments] = useState<GapTreatment[]>([]);
  const [role, setRole] = useState<UserRole>("control_owner");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const setTab = (index: number) => updateStrategyQuery("tab", projectTabs[index]);
  const setFrameworkFilter = (value: string) => updateStrategyQuery("framework", value);
  const setCoverageFilter = (value: string) => updateStrategyQuery("coverage", value);
  const setVerificationFilter = (value: string) => updateStrategyQuery("verification", value);
  const [saving, setSaving] = useState(false);
  const [gapTitle, setGapTitle] = useState("");
  const [treatmentType, setTreatmentType] = useState<GapTreatment["treatment_type"]>("technology");
  const [recommendation, setRecommendation] = useState("");
  const [treatmentPriority, setTreatmentPriority] = useState<GapTreatment["priority"]>("medium");
  const [technologies, setTechnologies] = useState("");
  const [reads, setReads] = useState<{ requirements: ReadStatus; controls: ReadStatus; legacy: ReadStatus; treatments: ReadStatus }>({ requirements: "UNAVAILABLE", controls: "UNAVAILABLE", legacy: "UNAVAILABLE", treatments: "UNAVAILABLE" });
  const treatmentEpoch = useRef(createReadEpoch());
  const requirementsReady = reads.requirements === "COMPLETE";
  const controlsReady = requirementsReady && reads.controls === "COMPLETE";
  const treatmentsReady = reads.treatments === "COMPLETE";
  const canManage = role === "admin" || role === "cybersecurity_team";

  async function loadTreatments(projectId: number) {
    const epoch = treatmentEpoch.current.begin();
    const result = await readStrategyRows((from, to) => supabase
      .from("cybersecurity_project_gap_treatments")
      .select("id,project_id,gap_title,treatment_type,recommendation,priority", { count: "exact" })
      .eq("project_id", projectId).order("id").range(from, to), row => row.id);
    if (!treatmentEpoch.current.valid(epoch)) return;
    setTreatments(result.data as GapTreatment[]);
    setReads(previous => ({ ...previous, treatments: result.status }));
  }

  useEffect(() => {
    let active = true;
    const epoch = treatmentEpoch.current;
    (async () => {
      try {
        const { profile } = await requireProfile();
        if (!active) return;
        setRole(profile.role);
        const projectId = projectIdFromPath(id);
        if (projectId === null) throw new Error("رقم المشروع غير صحيح.");
        const [p, pr, legacy] = await Promise.all([
          supabase.from("cybersecurity_projects").select("*").eq("id", projectId).single(),
          readStrategyRows((from, to) => supabase
            .from("cybersecurity_project_requirements")
            .select("project_id,requirement_id,coverage_type,cybersecurity_requirements(id,requirement_code,title_ar,status)", { count: "exact" })
            .eq("project_id", projectId).order("project_id").order("requirement_id").range(from, to),
            row => `${row.project_id}:${row.requirement_id}`),
          readStrategyRows((from, to) => supabase.from("cybersecurity_project_controls")
            .select("project_id,control_id,controls(id,control_code,title_ar)", { count: "exact" })
            .eq("project_id", projectId).order("project_id").order("control_id").range(from, to),
            row => `${row.project_id}:${row.control_id}`),
          loadTreatments(projectId),
        ]);
        if (!active) return;
        if (p.error || !p.data) throw new Error("المشروع غير موجود أو ليس ضمن صلاحيتك.");
        setProject(p.data as Project);
        setLegacyLinks(legacy.status === "COMPLETE" ? legacy.data as unknown as LegacyLink[] : []);
        setReads(previous => ({ ...previous, legacy: legacy.status === "COMPLETE" && legacy.data.every(row => single(row.controls)) ? "COMPLETE" : "UNAVAILABLE" }));
        setTechnologies((p.data as Project).recommended_technologies ?? "");
        const rows = pr.data as unknown as ProjectRequirement[];
        const requirementsComplete = !pr.error && rows.every(row => single(row.cybersecurity_requirements));
        setProjectRequirements(rows);
        setReads(previous => ({ ...previous, requirements: requirementsComplete ? "COMPLETE" : "UNAVAILABLE" }));
        if (!requirementsComplete) return;
        const requirementIds = rows.map(row => row.requirement_id);
        if (!requirementIds.length) {
          setRequirementControls([]);
          setReads(previous => ({ ...previous, controls: "COMPLETE" }));
          return;
        }
        const [rc, activeControlResult] = await Promise.all([
          readStrategyRows((from, to) => supabase
            .from("cybersecurity_requirement_controls")
            .select("requirement_id,control_id,coverage_type,mapping_confidence,controls(id,control_code,title_ar,implementation_status,evidence_status,verification_status,frameworks(code))", { count: "exact" })
            .eq("mapping_status", "active").in("requirement_id", requirementIds)
            .order("requirement_id").order("control_id").range(from, to),
            row => `${row.requirement_id}:${row.control_id}`),
          readStrategyRows((from, to) => supabase.from("controls").select("id,frameworks!inner(is_active)", { count: "exact" })
            .eq("frameworks.is_active", true).order("id").range(from, to), row => row.id),
        ]);
        if (!active) return;
        const controlRows = rc.data as unknown as RequirementControl[];
        const complete = !rc.error && !activeControlResult.error && controlRows.every(row => {
          const control = single(row.controls);
          return control && single(control.frameworks);
        });
        const activeIds = new Set(activeControlResult.data.map(row => row.id));
        setRequirementControls(complete ? controlRows.filter(row => activeIds.has(row.control_id)) : []);
        setReads(previous => ({ ...previous, controls: complete ? "COMPLETE" : "UNAVAILABLE" }));
      } catch (cause) {
        if (!active) return;
        // Only our two safe identity messages may be shown, never service details.
        const message = cause instanceof Error ? cause.message : "";
        setError(["رقم المشروع غير صحيح.", "المشروع غير موجود أو ليس ضمن صلاحيتك."].includes(message)
          ? message : "تعذر تحميل المشروع ضمن صلاحياتك الحالية.");
        const { data } = await supabase.auth.getSession();
        if (active && !data.session) router.replace("/login");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      epoch.cancel();
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
    const rows: Array<{ requirementId: number; requirementCode: string; projectCoverage: "full" | "partial" | "supporting" | null; coverage: "full" | "partial" | "supporting"; mappingConfidence: "confirmed" | "probable"; control: ControlRow }> = [];
    for (const rc of requirementControls) {
      const control = single(rc.controls);
      if (!control) continue;
      const projectLink = projectRequirements.find(item => item.requirement_id === rc.requirement_id);
      const requirement = single(projectLink?.cybersecurity_requirements ?? null);
      rows.push({ requirementId: rc.requirement_id, requirementCode: requirement?.requirement_code ?? "—", projectCoverage: projectLink?.coverage_type ?? null, coverage: rc.coverage_type, mappingConfidence: rc.mapping_confidence, control });
    }
    return rows;
  }, [requirementControls, projectRequirements]);

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

  const view = projectView(params, controlFrameworks);
  const tab = projectTabs.indexOf(view.tab);
  const { framework: frameworkFilter, coverage: coverageFilter, verification: verificationFilter } = view;

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
    // Coverage and confidence describe each Requirement–Control mapping path.
    // The distinct Control count and authoritative Control state are separate.
    const full = derivedControls.filter((row) => row.coverage === "full").length;
    const partial = derivedControls.filter((row) => row.coverage === "partial").length;
    const supporting = derivedControls.filter((row) => row.coverage === "supporting").length;
    const readyForVerification = uniqueControls.filter((c) => c.evidence_status === "accepted" && c.verification_status !== "verified").length;
    const verified = uniqueControls.filter((c) => goodVerification(c.verification_status)).length;
    const contribution = uniqueControls.length ? Math.round((verified / uniqueControls.length) * 100) : null;
    const confirmedMappings = derivedControls.filter((row) => row.mappingConfidence === "confirmed").length;
    const probableMappings = derivedControls.length - confirmedMappings;
    const requirementsWithoutMapping = requirementsWithStats.filter((item) => item.mappingStatus === "unresolved").length;
    return {
      requirementsCount: new Set(projectRequirements.map(row => row.requirement_id)).size,
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
  if (error || !project) return <main className="roadmap-page" dir="rtl"><p role="alert">{error}</p><Link href={returnContext.href}>العودة إلى {returnContext.label}</Link></main>;

  const clampedProgress = Math.max(0, Math.min(100, Number(project.progress_percent) || 0));
  const coverageTotal = rollup.full + rollup.partial + rollup.supporting;
  const coveragePct = (n: number) => (coverageTotal ? Math.round((n / coverageTotal) * 100) : 0);

  return (
    <main className="roadmap-page" dir="rtl">
      <section className="roadmap-shell">
        <Link className="detail-back" href={returnContext.href}>← العودة إلى {returnContext.label}</Link>

        {actionError && <p className="roadmap-alert" role="alert">{actionError}</p>}
        {message && <p className="roadmap-message" role="status">{message}</p>}

        <header className="project-detail-head">
          <h1>{project.name_ar}</h1>
          <p className="project-detail-tags">
            <span dir="ltr">{project.project_code}</span> · {project.work_type ? workTypeLabels[project.work_type] : "نوع العمل بانتظار التصنيف"} · {statusText[project.status] ?? project.status} · أولوية {project.portfolio_priority ? priorityLabels[project.portfolio_priority] : "غير مصنّفة"}
          </p>
          <p className="project-detail-line">
            {project.execution_year ? executionYearLabels[project.execution_year] : "سنة التنفيذ غير محددة"} · <bdi>{formatDuration(project.duration_value, project.duration_unit)}</bdi> · {project.archived_at ? "المحفظة المؤرشفة" : "المحفظة النشطة"} <span className="sep">|</span> المالك: <bdi>{ownerText(project)}</bdi> <span className="sep">|</span> الإنجاز: <bdi>{`${clampedProgress}%`}</bdi>
          </p>
          <div className="project-detail-progress"><i style={{ width: `${clampedProgress}%` }} /></div>
          <p role="status">{mappingCompletenessLabels[project.mapping_completeness ?? "mapping_pending"]}
            {project.import_staging_id && <> — {project.mapping_exact_count} من {project.mapping_reference_count} مراجع مصدر مرتبطة؛ {project.mapping_reference_count - project.mapping_exact_count - project.mapping_source_error_count} بانتظار المراجعة، {project.mapping_source_error_count} أخطاء مصدر. عدد الضوابط المرتبطة لا يمثل كامل النطاق. اكتمال الربط لا يعني الامتثال.</>}
          </p>
        </header>

        <ReadNotice statuses={["COMPLETE", ...Object.values(reads)]} />
        <section className="project-kpi-row" aria-label="مؤشرات المشروع الأساسية">
          <article className="project-kpi">
            <span>المتطلبات</span>
            <strong>{requirementsReady ? new Set(projectRequirements.map(row => row.requirement_id)).size : unavailable}</strong>
          </article>
          <article className="project-kpi" title="ضوابط مميزة مرتبطة عبر متطلبات المشروع">
            <span>ضوابط عبر المتطلبات</span>
            <strong>{controlsReady ? rollup.totalControls : unavailable}</strong>
          </article>
          <article className="project-kpi" title="روابط مباشرة مسجّلة بين المشروع والضابط؛ مصدر مستقل لا يُجمع مع ضوابط المتطلبات">
            <span>روابط مباشرة</span>
            <strong>{reads.legacy === "COMPLETE" ? new Set(legacyLinks.map(link => link.control_id)).size : unavailable}</strong>
          </article>
          <article className="project-kpi" title="Confirmed mappings — ربط مدعوم مباشرة بنص ضابط رسمي">
            <span>مواءمات مؤكدة عبر المتطلبات</span>
            <strong>{controlsReady ? rollup.confirmedMappings : unavailable}</strong>
          </article>
          <article className="project-kpi">
            <span>ضوابط بأدلة مقبولة ولم تُتحقق</span>
            <strong>{controlsReady ? rollup.readyForVerification : unavailable}</strong>
          </article>
          <article className="project-kpi project-kpi-contribution">
            <span>نسبة الضوابط المرتبطة التي حالتها متحققة</span>
            <strong>{controlsReady ? (rollup.contribution === null ? "—" : `${rollup.contribution}%`) : unavailable}</strong>
            {controlsReady && <small>{rollup.contribution === null ? noRelationship : `${rollup.verified} من ${rollup.totalControls} ضوابط متحققة`}</small>}
            {controlsReady && <div className="project-kpi-progress"><i style={{ width: `${rollup.contribution ?? 0}%` }} /></div>}
          </article>
        </section>
        <p className="detail-hint">النسبة هي الضوابط التي حالتها متحققة من إجمالي الضوابط المميزة المرتبطة عبر المتطلبات؛ لا تثبت أثر المشروع أو امتثال الضابط بسبب إنجاز المشروع. الأدلة المقبولة وحدها لا تثبت أهلية أمر التحقق.</p>

        <ReadSection available={controlsReady}><section className="project-summary-grid">
          <article className="coverage-summary-card">
            <header><h2>تغطية مواءمات المتطلبات والضوابط</h2></header>
            <div className="coverage-seg-bar" role="img" aria-label={`مواءمات بتغطية كاملة ${rollup.full}، جزئية ${rollup.partial}، داعمة ${rollup.supporting}`}>
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
              <li><span className="legend-dot full" />مواءمة بتغطية كاملة: <b>{rollup.full}</b></li>
              <li><span className="legend-dot partial" />مواءمة بتغطية جزئية: <b>{rollup.partial}</b></li>
              <li><span className="legend-dot supporting" />مواءمة بتغطية داعمة: <b>{rollup.supporting}</b></li>
              <li>روابط مباشرة مسجّلة: <b>{reads.legacy === "COMPLETE" ? new Set(legacyLinks.map(link => link.control_id)).size : unavailable}</b> — مستقلة عن المتطلبات ودون استنتاج مستوى التغطية</li>
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
        </section></ReadSection>

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
                <dl className="project-facts">
                  <div><dt>الأولوية</dt><dd>{project.portfolio_priority ? priorityLabels[project.portfolio_priority] : "غير مصنّفة"}</dd></div>
                  <div><dt>سنة التنفيذ</dt><dd>{project.execution_year ? executionYearLabels[project.execution_year] : "غير محددة"}</dd></div>
                  <div><dt>مدة المشروع</dt><dd>{formatDuration(project.duration_value, project.duration_unit)}</dd></div>
                  <div><dt>نوع العمل</dt><dd>{project.work_type ? workTypeLabels[project.work_type] : "بانتظار التصنيف"}</dd></div>
                  <div><dt>الجهة المالكة</dt><dd>{ownerText(project)}</dd></div>
                  <div><dt>الحالة</dt><dd>{statusText[project.status] ?? project.status}</dd></div>
                  <div><dt>نسبة الإنجاز</dt><dd>{clampedProgress}%</dd></div>
                  <div><dt>المحفظة</dt><dd>{project.archived_at ? `مؤرشفة${project.archive_reason ? ` — ${project.archive_reason}` : ""}` : "نشطة"}</dd></div>
                </dl>
                <h3>وصف المشروع</h3>
                <p>{project.description_ar || "لا يوجد وصف مسجل."}</p>
                <h3>النتيجة المستهدفة</h3>
                <p className="project-outcome">{project.target_outcome?.trim() || "لا توجد نتيجة مستهدفة مسجلة."}</p>
                <p className="detail-hint">النتيجة المتوقع تحقيقها عند اكتمال المشروع؛ ليست إثباتًا لتحقق النتيجة.</p>
                <p>آخر تعديل: {project.updated_at && Number.isFinite(Date.parse(project.updated_at)) ? <time dateTime={project.updated_at}>{new Date(project.updated_at).toLocaleString("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh" })} (الرياض)</time> : "غير مسجل"}</p>
              </section>
            )}

            {tab === 1 && (<ReadSection available={requirementsReady}>
              <section className="requirements-tab">
                {!requirementsWithStats.length && <p className="roadmap-empty">{noRelationship}</p>}
                {requirementsWithStats.map(
                  (item) =>
                    item.requirement && (
                      <article className="requirement-card" key={item.requirement.id}>
                        <header>
                          <h3>{item.requirement.title_ar}</h3><small>معرف المطلب الداخلي: <span dir="ltr">{item.requirement.requirement_code}</span></small>
                          <span className="requirement-coverage-tag">تغطية المشروع لهذا المتطلب: {coverageText[item.coverage] ?? item.coverage}</span>
                        </header>
                        {!controlsReady ? <p className="metric-unavailable">{unavailable}</p> : item.mappingStatus === "unresolved" ? (
                          <p className="requirement-warning">
                            <StatusBadge status="needs_control_mapping" /> لا يوجد ضابط رسمي موثوق مرتبط بهذا المتطلب بعد — غير محسوب ضمن الضوابط المُتحقَّقة أو نسبة الضوابط المرتبطة التي حالتها متحققة أو تغطية الضوابط.
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
              </section></ReadSection>
            )}

            {tab === 2 && (<ReadSection available={controlsReady}>
              <section className="controls-tab">
                <h2>العلاقات عبر المتطلبات</h2>
                <p className="detail-hint">تُعرض المواءمات النشطة فقط. كل صف مسار متطلب ← ضابط؛ قد يظهر الضابط في أكثر من مسار، بينما يُحسب مرة واحدة في ملخص الضوابط المميزة.</p>
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
                        <th>المتطلب وتغطية المشروع</th>
                        <th>الضابط</th>
                        <th>التغطية</th>
                        <th>جودة الربط</th>
                        <th>التطبيق</th>
                        <th>الدليل</th>
                        <th>التحقق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredControlRows.map((row) => {
                        const framework = single(row.control.frameworks);
                        return (
                          <tr key={`${row.requirementId}:${row.control.id}`}>
                            <td dir="ltr">{framework?.code ?? "—"}</td>
                            <td><span dir="ltr">{row.requirementCode}</span><small> · تغطية المشروع: {row.projectCoverage ? coverageText[row.projectCoverage] : unavailable}</small></td>
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
              </section></ReadSection>
            )}
            {tab === 2 && <ReadSection available={reads.legacy === "COMPLETE"}>
              <section className="detail-card">
                <h2>روابط مباشرة مسجّلة</h2>
                <p className="detail-hint">سجل مستقل عن العلاقات عبر المتطلبات؛ لا يُستنتج منه متطلب أو مستوى تغطية أو تحقق امتثال.{project.import_staging_id ? " لمشاريع المحفظة المستوردة تقتصر هذه الروابط على مطابقات المصدر الحرفية المعتمدة (exact_match)." : ""}</p>
                {!legacyLinks.length ? <p>{noRelationship}</p> : <ul>{legacyLinks.map(link => {
                  const legacyControl = single(link.controls);
                  return <li key={`${link.project_id}:${link.control_id}`}><Link href={`/controls/${link.control_id}`}><span dir="ltr">{legacyControl?.control_code}</span> — {legacyControl?.title_ar}</Link></li>;
                })}</ul>}
              </section>
            </ReadSection>}

            {tab === 3 && (<ReadSection available={controlsReady}>
              <section className="detail-card">
                <h2>الأدلة</h2>
                <p className="detail-hint">يُستخدم سجل الأدلة والمراجعة الحالي كما هو — لا مسار رفع أو مراجعة جديد هنا. افتح الضابط لإدارة دليله.</p>
                {!uniqueControls.length ? (
                  <p className="roadmap-empty">{noRelationship}</p>
                ) : (
                  uniqueControls.map((control) => (
                    <article className="control-evidence-item" key={control.id}>
                      <b dir="ltr">{control.control_code}</b> — {control.title_ar}
                      <p>حالة الدليل: <StatusBadge status={control.evidence_status} /></p>
                      <Link className="detail-back" href={`/controls/${control.id}`}>فتح الأدلة والمراجعة ←</Link>
                    </article>
                  ))
                )}
              </section></ReadSection>
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
                  {!treatmentsReady ? <p className="metric-unavailable">{unavailable} — تعذر تحميل المعالجات.</p> : treatments.length ? (
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

            {tab === 5 && (<ReadSection available={controlsReady}>
              <section>
                {!uniqueControls.length && <section className="detail-card"><p>لا توجد ضوابط مرتبطة، لا يوجد سجل تدقيق مرتبط بعد.</p></section>}
                {uniqueControls.map((control) => (
                  <details className="control-evidence-item" key={control.id} open={uniqueControls.length === 1}>
                    <summary dir="ltr">{control.control_code} — {control.title_ar}</summary>
                    <GrcAuditTrail controlId={control.id} reliableRead />
                  </details>
                ))}
              </section></ReadSection>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
