"use client";
import AssessmentFindingLinks from "@/components/AssessmentFindingLinks";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { archiveQueryValue, portfolioFiltersFrom, projectHref, registerState, updateStrategyQuery, type StrategyQueryKey } from "@/lib/strategy-navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, createReadEpoch, unavailable, type ReadStatus } from "@/lib/strategy-read";
import { ReadNotice } from "./read-state";
import { ArchivedBadge, FilterBar, FilterSelect, MappingBadge, PageHeader, PriorityBadge, priorityYearOptions, RoadmapTabs, StatusChip, SummaryStrip, type SummaryItem } from "./portfolio-ui";
import { missingData, missingFieldLabels, showDurationUnitFilter, showProgress, type MissingField } from "@/lib/roadmap-presentation";
import { emptyProjectForm, projectToForm, projectWriteFields, type ProjectForm as Form } from "@/lib/strategy-project-fields";
import { type CoverageType, type RequirementControlLink, type ProjectRequirementRow } from "./portfolio-metrics";
import PortfolioProjectFields from "@/components/PortfolioProjectFields";
import { projectCount } from "@/lib/arabic-count";
import { durationLabels, formatDuration, mappingCompletenessLabels, matchesPortfolioFilters, ownerLabels, statusLabels as statusText, workTypeLabels, type PortfolioProject } from "@/lib/project-portfolio";
import { canonicalRelationships, legacyRelationships } from "@/lib/strategy-relationships";
import "./roadmap.css";

// Canonical QA portfolio record (lib/project-portfolio.ts) plus the S1-D outcome.
type Project = PortfolioProject & { target_outcome: string | null };

type LinkRow = { project_id: number; control_id: number };

const ownerText = (project: Project) => project.executive_owner_code === "other" ? project.executive_owner_other : project.executive_owner_code ? ownerLabels[project.executive_owner_code] : null;
const missingOptions: Record<string, string> = { any: "أي حقل ناقص", ...missingFieldLabels };

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
  const modern = useMemo(() => mappingReady ? canonicalRelationships(
    scoped.map(project => project.id),
    requirementCoverage.filter((row): row is ProjectRequirementRow & { project_id: number } => row.project_id != null),
    requirementControlLinks,
  ) : null, [mappingReady, scoped, requirementCoverage, requirementControlLinks]);

  // Requirement-derived counts per project (shown only where non-zero).
  const requirementCounts = useMemo(() => modern?.byProject ?? new Map<number, { requirements: number; controls: number }>(), [modern]);

  const filterKey = JSON.stringify(filters);
  const missingFilter = state.missing;
  const filteredProjects = useMemo(
    () => projects.filter((project) => matchesPortfolioFilters(project, JSON.parse(filterKey))
      && (missingFilter === "all" || (missingFilter === "any" ? missingData(project).length > 0 : missingData(project).includes(missingFilter as MissingField)))),
    [projects, filterKey, missingFilter],
  );
  // Summary strip follows the filtered table; relationships keep their own sources.
  const summary = useMemo(() => {
    const ids = filteredProjects.map((project) => project.id);
    const direct = legacyRelationships(ids, linksReady ? links : null, null);
    const viaRequirements = mappingReady ? canonicalRelationships(ids, requirementCoverage.filter((row): row is ProjectRequirementRow & { project_id: number } => row.project_id != null), requirementControlLinks).counts : null;
    return {
      total: filteredProjects.length,
      p1: filteredProjects.filter((project) => project.portfolio_priority === "P1").length,
      p2: filteredProjects.filter((project) => project.portfolio_priority === "P2").length,
      p3: filteredProjects.filter((project) => project.portfolio_priority === "P3").length,
      direct: direct?.controls ?? null,
      requirements: viaRequirements?.requirements ?? 0,
      // Archived projects are history, not a completion work queue.
      incomplete: scoped.filter((project) => !project.archived_at && missingData(project).length > 0).length,
    };
  }, [filteredProjects, linksReady, links, mappingReady, requirementCoverage, requirementControlLinks, scoped]);

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

  const priorityValue = filters.priority !== "all" ? filters.priority : ({ "1": "P1", "2": "P2", "3": "P3", unset: "unset" } as Record<string, string>)[filters.year] ?? "all";
  const setPriority = (value: string) => {
    if (filters.year !== "all") updateStrategyQuery("execution_year", "all");
    updateStrategyQuery("priority", value);
  };
  const query = (key: StrategyQueryKey) => (value: string) => updateStrategyQuery(key, value);
  // A summary item is shown when it is non-zero or unreadable; zeros add no information.
  const informative = (value: number | null, ready: boolean) => !ready || value === null || value > 0;
  const summaryItems: SummaryItem[] = [
    { label: filters.archive === "archived" ? "مؤرشفة" : "المشاريع", value: projectsReady ? summary.total : unavailable },
    ...(["p1", "p2", "p3"] as const).filter((key) => informative(summary[key], projectsReady)).map((key) => ({ label: key.toUpperCase(), value: projectsReady ? summary[key] : unavailable })),
    ...(informative(summary.direct, linksReady) ? [{ label: "ضوابط بربط مباشر", value: summary.direct ?? unavailable }] : []),
    ...(mappingReady && summary.requirements > 0 ? [{ label: "متطلبات مرتبطة", value: summary.requirements }] : []),
    ...(canManage && projectsReady && summary.incomplete > 0 && missingFilter === "all" ? [{ label: "بيانات ناقصة", value: summary.incomplete, href: "?missing=any", tone: "attention" as const }] : []),
  ];

  return (
    <main className="roadmap-page rm-page" dir="rtl">
      <section className="roadmap-shell">
        <RoadmapTabs active="/roadmap" />
        <PageHeader title="سجل المشاريع السيبرانية" description="المصدر المعتمد لبيانات المشاريع: بحث، فلترة، تعديل ومتابعة." actions={canManage ? <button className="roadmap-primary" onClick={startCreate}>+ مشروع جديد</button> : undefined} />

        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        {message && <p className="roadmap-message" role="status">{message}</p>}
        <ReadNotice statuses={Object.values(reads)} />

        <SummaryStrip label="ملخص سجل المشاريع" items={summaryItems} />

        <FilterBar label="تصفية سجل المشاريع" count={projectsReady ? projectCount(filteredProjects.length) : unavailable}>
          <label className="rm-field rm-search"><span>بحث</span><input value={filters.query} onChange={(event) => updateStrategyQuery("q", event.target.value)} placeholder="اسم المشروع أو رمزه" /></label>
          <FilterSelect label="المحفظة" value={filters.archive} onChange={(value) => updateStrategyQuery("archive", archiveQueryValue(value))} options={{ active: "النشطة", archived: "المؤرشفة", all: "الكل" }} allLabel={null} />
          <FilterSelect label="الأولوية / سنة التنفيذ" value={priorityValue} onChange={setPriority} options={{ ...priorityYearOptions, unset: "غير مصنّفة" }} />
          <FilterSelect label="نوع العمل" value={filters.workType} onChange={query("work_type")} options={{ ...workTypeLabels, unset: "غير مصنّف" }} />
          <FilterSelect label="الجهة المالكة" value={filters.owner} onChange={query("owner")} options={{ ...ownerLabels, unset: "غير محددة" }} />
          <FilterSelect label="الحالة" value={filters.status} onChange={query("status")} options={statusText} />
          <FilterSelect label="اكتمال الربط" value={filters.mappingCompleteness} onChange={query("mapping")} options={mappingCompletenessLabels} />
          {showDurationUnitFilter(scoped, filters.durationUnit) && <FilterSelect label="وحدة المدة" value={filters.durationUnit} onChange={query("duration_unit")} options={{ ...durationLabels, unset: "غير محددة" }} />}
          {(filters.durationMin || filters.durationMax) && <>
            <label className="rm-field"><span>المدة من</span><input type="number" min="0" step="any" value={filters.durationMin} onChange={(event) => updateStrategyQuery("duration_min", event.target.value)} /></label>
            <label className="rm-field"><span>المدة إلى</span><input type="number" min="0" step="any" value={filters.durationMax} onChange={(event) => updateStrategyQuery("duration_max", event.target.value)} /></label>
          </>}
          {(missingFilter !== "all" || (canManage && projectsReady && summary.incomplete > 0)) && <FilterSelect label="بيانات ناقصة" value={missingFilter} onChange={query("missing")} options={missingOptions} />}
        </FilterBar>

        <div className="rm-table-wrap rm-register-wrap"><table className="rm-table rm-register">
          <caption className="rm-visually-hidden">سجل المشاريع — {projectsReady ? projectCount(filteredProjects.length) : unavailable}</caption>
          <thead><tr>{["المشروع", "الأولوية", "نوع العمل", "الجهة المالكة", "المدة", "الحالة", "اكتمال الربط", "الإجراءات"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{filteredProjects.map((project) => {
            const href = projectHref(project.id, "register", params);
            const archived = Boolean(project.archived_at);
            const owner = ownerText(project);
            const viaRequirements = mappingReady ? requirementCounts.get(project.id) : undefined;
            return <tr key={project.id} className={archived ? "is-archived" : undefined}>
              <th scope="row"><Link className="strategy-project-link" href={href}>{project.name_ar}</Link><span className="rm-code-line"><bdi className="rm-code" dir="ltr">{project.project_code}</bdi>{archived && <ArchivedBadge />}</span></th>
              <td>{archived && !project.portfolio_priority ? <span className="rm-muted">—</span> : <PriorityBadge priority={project.portfolio_priority} />}</td>
              <td className="rm-nowrap">{project.work_type ? workTypeLabels[project.work_type] : <span className="rm-muted">—</span>}</td>
              <td>{owner ? <bdi className={project.executive_owner_code === "other" ? "rm-owner-other" : "rm-nowrap"}>{owner}</bdi> : <span className="rm-muted">—</span>}</td>
              <td className="rm-nowrap">{project.duration_value !== null && project.duration_unit ? <bdi>{formatDuration(project.duration_value, project.duration_unit)}</bdi> : <span className="rm-muted">—</span>}</td>
              <td><StatusChip status={project.status} />{showProgress(project) && <small className="rm-progress"><bdi>{`${Number(project.progress_percent)}%`}</bdi></small>}</td>
              <td>{!(archived && !project.import_staging_id) && <MappingBadge completeness={project.mapping_completeness} exact={project.mapping_exact_count} references={project.import_staging_id ? project.mapping_reference_count : undefined} />}
                {viaRequirements && viaRequirements.requirements > 0
                  ? <small className="rm-sub rm-nowrap" title="علاقات عبر المتطلبات">متطلبات <bdi>{viaRequirements.requirements}</bdi> · ضوابط <bdi>{viaRequirements.controls}</bdi></small>
                  : archived && !project.import_staging_id && <span className="rm-muted">—</span>}</td>
              <td className="rm-actions"><Link className="register-action-primary" href={href}>فتح</Link>{canManage && !archived && <button type="button" className="register-action-secondary" onClick={() => openProject(project)}>تعديل</button>}</td>
            </tr>;
          })}</tbody>
        </table>{projectsReady && !filteredProjects.length && <p className="roadmap-empty">لا توجد مشاريع مطابقة للفلاتر الحالية.</p>}</div>
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
