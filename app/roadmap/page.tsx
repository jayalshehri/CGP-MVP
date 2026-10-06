"use client";
import AssessmentFindingLinks from "@/components/AssessmentFindingLinks";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { archiveQueryValue, portfolioFiltersFrom, projectHref, registerState, updateStrategyQuery, type StrategyQueryKey } from "@/lib/strategy-navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, createReadEpoch, unavailable, noRelationship, type ReadStatus } from "@/lib/strategy-read";
import { ReadNotice } from "./read-state";
import { emptyProjectForm, projectToForm, projectWriteFields, type ProjectForm as Form } from "@/lib/strategy-project-fields";
import { requirementRollup, type CoverageType, type RequirementControlLink, type ProjectRequirementRow } from "./portfolio-metrics";
import PortfolioProjectFields from "@/components/PortfolioProjectFields";
import { durationLabels, formatDuration, mappingCompletenessLabels, matchesPortfolioFilters, ownerLabels, priorityLabels, statusLabels as statusText, workTypeLabels, type PortfolioProject } from "@/lib/project-portfolio";
import { canonicalRelationships, legacyRelationships } from "@/lib/strategy-relationships";
import "./roadmap.css";

// Canonical QA portfolio record (lib/project-portfolio.ts) plus the S1-D outcome.
type Project = PortfolioProject & { target_outcome: string | null };

type LinkRow = { project_id: number; control_id: number };

const yearText = { "1": "السنة الأولى", "2": "السنة الثانية", "3": "السنة الثالثة" };
const ownerText = (project: Project) => project.executive_owner_code === "other" ? project.executive_owner_other : project.executive_owner_code ? ownerLabels[project.executive_owner_code] : "بانتظار التصنيف";

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
  const [form, setForm] = useState<Form>(emptyProjectForm);
  const state = registerState(params);
  const filters = portfolioFiltersFrom(state);
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
      readStrategyRows((from, to) => supabase.from("cybersecurity_projects").select("*", { count: "exact" }).order("execution_year", { nullsFirst: false }).order("project_code").order("id").range(from, to), row => row.id),
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

  // Metrics describe the selected portfolio scope (active by default, archived
  // or all); historical relationships stay attached to archived projects.
  const scoped = useMemo(() => projects.filter(project => filters.archive === "all" || (filters.archive === "archived") === Boolean(project.archived_at)), [projects, filters.archive]);
  const requirementStats = useMemo(() => {
    if (!mappingReady) return requirementRollup([], []);
    const visibleProjects = new Set(scoped.map(project => project.id));
    const scopedRequirements = requirementCoverage.filter(row => row.project_id != null && visibleProjects.has(row.project_id));
    const requirementIds = new Set(scopedRequirements.map(row => row.requirement_id));
    return requirementRollup(scopedRequirements, requirementControlLinks.filter(row => requirementIds.has(row.requirement_id)));
  }, [scoped, requirementCoverage, requirementControlLinks, mappingReady]);

  const modern = useMemo(() => mappingReady ? canonicalRelationships(
    scoped.map(project => project.id),
    requirementCoverage.filter((row): row is ProjectRequirementRow & { project_id: number } => row.project_id != null),
    requirementControlLinks,
  ) : null, [mappingReady, scoped, requirementCoverage, requirementControlLinks]);
  const legacy = useMemo(() => legacyRelationships(
    scoped.map(project => project.id), linksReady ? links : null, modern?.paths ?? null,
  ), [scoped, linksReady, links, modern]);

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

  const stats = useMemo(() => ({
    total: scoped.length,
    planned: scoped.filter((project) => project.status === "planned").length,
    active: scoped.filter((project) => project.status === "in_progress").length,
    p1: scoped.filter((project) => project.portfolio_priority === "P1").length,
    p2: scoped.filter((project) => project.portfolio_priority === "P2").length,
    p3: scoped.filter((project) => project.portfolio_priority === "P3").length,
    linked: legacy?.controls ?? 0,
  }), [scoped, legacy]);

  const filterKey = JSON.stringify(filters);
  const filteredProjects = useMemo(
    () => projects.filter((project) => matchesPortfolioFilters(project, JSON.parse(filterKey))),
    [projects, filterKey],
  );

  function startCreate() {
    setSelected(null);
    setForm(emptyProjectForm);
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

  const filterSelect = (label: string, key: StrategyQueryKey, value: string, labels: Record<string, string>, allowUnset = true) =>
    <label><span>{label}</span><select value={value} onChange={(event) => updateStrategyQuery(key, event.target.value)}>
      <option value="all">الكل</option>{allowUnset && <option value="unset">غير مصنّف</option>}
      {Object.entries(labels).map(([option, text]) => <option key={option} value={option}>{text}</option>)}
    </select></label>;

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
            <p>الأولوية وسنة التنفيذ والمدة والتصنيف المعتمد لكل مشروع، وتنعكس على التحليل وخارطة طريق المشاريع.</p>
          </div>
          {canManage && <button className="roadmap-primary" onClick={startCreate}>+ مشروع جديد</button>}
        </header>

        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        {message && <p className="roadmap-message" role="status">{message}</p>}
        <ReadNotice statuses={Object.values(reads)} />

        <section className="roadmap-metrics register-metrics" aria-label="مؤشرات سجل المشاريع">
          <Metric label="مشاريع النطاق المعروض" value={projectsReady ? stats.total : unavailable} />
          <Metric label="مخططة" value={projectsReady ? stats.planned : unavailable} tone="muted" />
          <Metric label="قيد التنفيذ" value={projectsReady ? stats.active : unavailable} tone="active" />
          <Metric label="P1" value={projectsReady ? stats.p1 : unavailable} />
          <Metric label="P2" value={projectsReady ? stats.p2 : unavailable} />
          <Metric label="P3" value={projectsReady ? stats.p3 : unavailable} />
          <Metric label="ضوابط ذات ربط مباشر مسجّل" value={linksReady ? stats.linked : unavailable} tone="linked" />
          <Metric label="متطلبات سيبرانية مميزة مرتبطة" value={modern ? modern.counts.requirements : unavailable} tone="linked" />
          <Metric label="علاقات مشروع–متطلب" value={modern ? modern.counts.projectRequirementLinks : unavailable} tone="linked" />
          <Metric label="ضوابط مميزة عبر المتطلبات" value={modern ? modern.counts.controls : unavailable} tone="linked" />
          <Metric label="ضوابط مرتبطة عبر المتطلبات وحالتها متحققة" value={mappingReady ? requirementStats.verified : unavailable} tone="active" />
          <Metric label="مواءمات مؤكدة (Confirmed)" value={mappingReady ? requirementStats.confirmedMappings : unavailable} tone="linked" />
          <Metric label="مواءمات محتملة (Probable)" value={mappingReady ? requirementStats.probableMappings : unavailable} tone="warning" />
          <Metric label="متطلبات بلا ربط ضوابط" value={mappingReady ? requirementStats.requirementsWithoutMapping : unavailable} tone={requirementStats.requirementsWithoutMapping ? "warning" : "muted"} />
        </section>

        <section className="register-toolbar portfolio-toolbar" aria-label="تصفية سجل المشاريع">
          <label className="register-search"><span>بحث</span><input value={filters.query} onChange={(event) => updateStrategyQuery("q", event.target.value)} placeholder="اسم المشروع أو رمزه" /></label>
          <label><span>المحفظة</span><select value={filters.archive} onChange={(event) => updateStrategyQuery("archive", archiveQueryValue(event.target.value))}>
            <option value="active">النشطة</option><option value="archived">المؤرشفة</option><option value="all">الجميع</option>
          </select></label>
          {filterSelect("الأولوية", "priority", filters.priority, priorityLabels)}
          {filterSelect("سنة التنفيذ", "execution_year", filters.year, yearText)}
          {filterSelect("نوع العمل", "work_type", filters.workType, workTypeLabels)}
          {filterSelect("الجهة المالكة", "owner", filters.owner, ownerLabels)}
          {filterSelect("الحالة", "status", filters.status, statusText, false)}
          {filterSelect("وحدة المدة", "duration_unit", filters.durationUnit, durationLabels)}
          {filterSelect("اكتمال الربط", "mapping", filters.mappingCompleteness, mappingCompletenessLabels, false)}
          <label><span>المدة من</span><input type="number" min="0" step="any" value={filters.durationMin} onChange={(event) => updateStrategyQuery("duration_min", event.target.value)} /></label>
          <label><span>المدة إلى</span><input type="number" min="0" step="any" value={filters.durationMax} onChange={(event) => updateStrategyQuery("duration_max", event.target.value)} /></label>
          <strong>{projectsReady ? `${filteredProjects.length} مشروع` : unavailable}</strong>
          <small>حدود المدة تقارن القيمة بوحدتها؛ اختر وحدة للمقارنة بين مدد متجانسة.</small>
        </section>

        <div className="portfolio-table-wrap"><table className="portfolio-table">
          <caption>سجل المشاريع — {projectsReady ? `${filteredProjects.length} مشروع` : unavailable}</caption>
          <thead><tr>{["المشروع", "المتطلبات والضوابط", "نوع العمل", "الجهة المالكة", "الأولوية", "مدة المشروع", "سنة التنفيذ", "الحالة", "الإنجاز", "الإجراءات"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{filteredProjects.map((project) => {
            const reqStats = perProjectStats.get(project.id);
            const href = projectHref(project.id, "register", params);
            return <tr key={project.id} className={project.archived_at ? "is-archived" : undefined}>
              <th scope="row"><Link className="strategy-project-link" href={href}>{project.name_ar}</Link><small dir="ltr">{project.project_code}</small><small>{project.archived_at ? "المحفظة المؤرشفة" : "المحفظة النشطة"}</small></th>
              <td className="register-req-ctrl-stats">
                {!mappingReady ? <span>العلاقات عبر المتطلبات: {unavailable}</span> : !reqStats?.requirementsCount ? <span>العلاقات عبر المتطلبات: {noRelationship}</span> : <span className="register-stats-line">{reqStats.requirementsCount} متطلب · {reqStats.controlsCount} ضوابط · {reqStats.verifiedCount} متحقق</span>}
                <span className="register-mapping-line">روابط مباشرة مسجّلة: {linksReady ? new Set(links.filter(link => link.project_id === project.id).map(link => link.control_id)).size : unavailable}</span>
                <strong>{mappingCompletenessLabels[project.mapping_completeness ?? "mapping_pending"]}</strong>
                {project.import_staging_id && <small>{project.mapping_exact_count} من {project.mapping_reference_count} مراجع مصدر مرتبطة بمطابقة مثبتة؛ {project.mapping_reference_count - project.mapping_exact_count - project.mapping_source_error_count} بانتظار المراجعة، {project.mapping_source_error_count} أخطاء مصدر. العدد المرتبط لا يمثل كامل نطاق الضوابط.</small>}
                <small>اكتمال الربط ليس تحققًا من الامتثال.</small>
              </td>
              <td>{project.work_type ? workTypeLabels[project.work_type] : "بانتظار التصنيف"}</td>
              <td>{ownerText(project)}</td>
              <td><span className={`register-priority ${project.portfolio_priority ?? ""}`}>{project.portfolio_priority ?? "غير مصنّفة"}</span></td>
              <td>{formatDuration(project.duration_value, project.duration_unit)}</td>
              <td>{project.execution_year ? yearText[String(project.execution_year) as keyof typeof yearText] : "غير محددة"}</td>
              <td><span className={`roadmap-status ${project.status}`}>{statusText[project.status]}</span></td>
              <td>{Number(project.progress_percent)}%</td>
              <td className="register-actions"><Link className="register-action-primary" href={href}>صفحة المشروع ←</Link>{canManage && <button type="button" className="register-action-secondary" onClick={() => openProject(project)}>تعديل</button>}</td>
            </tr>;
          })}</tbody>
        </table>{projectsReady && !filteredProjects.length && <p className="roadmap-empty">لا توجد مشاريع مطابقة للفلاتر الحالية.</p>}</div>

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
              <PortfolioProjectFields form={form} onChange={(next) => setForm({ ...next, target_outcome: form.target_outcome })} creating={!selected} />
              <label className="wide">النتيجة المستهدفة<textarea rows={2} value={form.target_outcome} onChange={(event) => setForm({ ...form, target_outcome: event.target.value })} /><small>النتيجة المتوقع تحقيقها عند اكتمال المشروع. حقل اختياري، وليس إثباتًا لتحقق النتيجة.</small></label>
              {selected?.archived_at && <p className="wide detail-hint">المشروع ضمن المحفظة المؤرشفة{selected.archive_reason ? ` — ${selected.archive_reason}` : ""}. الأرشفة مستقلة عن حالة التنفيذ ولا تُدار من هذا النموذج.</p>}

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
