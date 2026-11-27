"use client";
import AssessmentFindingLinks from "@/components/AssessmentFindingLinks";
import AccessibleDialog from "@/components/AccessibleDialog";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { portfolioFiltersFrom, projectHref, registerState } from "@/lib/strategy-navigation";
import { PortfolioFilters, PortfolioTabs } from "./portfolio-workspace";
import styles from "./portfolio-workspace.module.css";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, createReadEpoch, unavailable, type ReadStatus } from "@/lib/strategy-read";
import { ReadNotice } from "./read-state";
import { emptyProjectForm, projectToForm, projectWriteFields, type ProjectForm as Form } from "@/lib/strategy-project-fields";
import { type CoverageType, type RequirementControlLink, type ProjectRequirementRow } from "./portfolio-metrics";
import PortfolioProjectFields from "@/components/PortfolioProjectFields";
import { executionYearLabels, matchesPortfolioFilters, statusLabels as statusText, type PortfolioProject } from "@/lib/project-portfolio";
import { canonicalRelationships, legacyRelationships } from "@/lib/strategy-relationships";
import "./roadmap.css";

// Canonical QA portfolio record (lib/project-portfolio.ts) plus the S1-D outcome.
type Project = PortfolioProject & { target_outcome: string | null };

type LinkRow = { project_id: number; control_id: number };

const ownerDisplay = { it: "تقنية المعلومات", cybersecurity: "الأمن السيبراني", dmo: "مكتب إدارة البيانات", other: "أخرى" } as const;
const ownerText = (project: Project) => project.executive_owner_code === "other" ? project.executive_owner_other || ownerDisplay.other : project.executive_owner_code ? ownerDisplay[project.executive_owner_code] : "غير محددة";

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
  const filters = useMemo(() => portfolioFiltersFrom(registerState(params)), [params]);
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

  const filteredProjects = useMemo(() => projects.filter(project => matchesPortfolioFilters(project, filters)), [projects, filters]);
  const scopeCount = projects.filter(project => filters.archive === "all" || (filters.archive === "archived") === Boolean(project.archived_at)).length;
  const currentIds = useMemo(() => filteredProjects.map(project => project.id), [filteredProjects]);
  const modern = useMemo(() => mappingReady ? canonicalRelationships(
    currentIds,
    requirementCoverage.filter((row): row is ProjectRequirementRow & { project_id: number } => row.project_id != null),
    requirementControlLinks,
  ) : null, [currentIds, mappingReady, requirementCoverage, requirementControlLinks]);
  const legacy = useMemo(() => legacyRelationships(currentIds, linksReady ? links : null, modern?.paths ?? null), [currentIds, linksReady, links, modern]);

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
    if (saving) return;
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
        if (result.error?.code === "23505") throw new Error("رمز المشروع مستخدم. اختر رمزًا مختلفًا.");
        if (result.error) throw result.error;
        router.push(projectHref(result.data.id, "register", params));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ المشروع.");
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحميل سجل المشاريع…</p></main>;
  }

  return (
    <main className="roadmap-page" dir="rtl">
      <section className="roadmap-shell">
        <PortfolioTabs current="register" params={params} />

        <header className={styles.registerHeader}>
          <div><h1>سجل المشاريع</h1><p>اعثر على مشروع وتابع حالته أو حدّث بياناته.</p></div>
          {canManage && <button className="roadmap-primary" onClick={startCreate}>+ مشروع جديد</button>}
        </header>

        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        {message && <p className="roadmap-message" role="status">{message}</p>}
        <ReadNotice statuses={[reads.projects]} />
        <PortfolioFilters current="register" params={params} count={projectsReady ? filteredProjects.length : null} total={scopeCount} />

        {projectsReady && (filteredProjects.length ? <div className={styles.registerTableWrap}><table className={styles.registerTable} role="table" aria-label="المشاريع المطابقة للفلاتر">
          <thead role="rowgroup"><tr role="row">{["المشروع", "الجهة المالكة", "السنة والأولوية", "الحالة", "التقدم", ...(canManage ? ["إجراءات"] : [])].map(label => <th role="columnheader" key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody role="rowgroup">{filteredProjects.map(project => {
            const href = projectHref(project.id, "register", params);
            return <tr role="row" key={project.id}>
              <th role="rowheader" scope="row"><Link className="strategy-project-link" href={href}>{project.name_ar}</Link><small><bdi>{project.project_code}</bdi>{project.archived_at && <> · مؤرشف</>}</small></th>
              <td role="cell" data-label="الجهة المالكة">{ownerText(project)}</td>
              <td role="cell" data-label="السنة والأولوية">{project.portfolio_priority && project.execution_year ? <span className={styles.phase}><bdi>{executionYearLabels[project.execution_year]}</bdi><bdi className={`register-priority ${project.portfolio_priority}`}>{project.portfolio_priority}</bdi></span> : "بلا أولوية"}</td>
              <td role="cell" data-label="الحالة"><span className={`roadmap-status ${project.status}`}>{statusText[project.status]}</span></td>
              <td role="cell" data-label="التقدم"><span className={styles.progress}><bdi>{Number(project.progress_percent)}%</bdi><progress max={100} value={Number(project.progress_percent)} aria-label={`تقدم ${project.name_ar}`} /></span></td>
              {canManage && <td role="cell" data-label="إجراءات"><button type="button" className={styles.edit} aria-label={`تعديل ${project.name_ar}`} onClick={() => openProject(project)}>تعديل</button></td>}
            </tr>;
          })}</tbody>
        </table></div> : <div className={styles.empty}>لا توجد مشاريع تطابق الفلاتر الحالية.</div>)}

        {projectsReady && filteredProjects.length > 0 && <details className={styles.linkSummary}>
          <summary>ملخص الربط بالضوابط للمشاريع المعروضة</summary>
          <ReadNotice statuses={[reads.links, reads.requirements, reads.mapping]} />
          <dl>
            <div><dt>ضوابط ذات ربط مباشر</dt><dd>{legacy?.controls ?? unavailable}</dd></div>
            <div><dt>متطلبات سيبرانية مرتبطة</dt><dd>{modern?.counts.requirements ?? unavailable}</dd></div>
            <div><dt>ضوابط مرتبطة عبر المتطلبات</dt><dd>{modern?.counts.controls ?? unavailable}</dd></div>
          </dl>
          <p>مسارا الربط منفصلان، ووجود رابط لا يعني تحقق الالتزام. التفاصيل ومراجع المصدر داخل المشروع.</p>
        </details>}
      </section>

      {open && (
        <AccessibleDialog backdropClassName="roadmap-dialog-backdrop" className="roadmap-dialog project-register-dialog compact-form-dialog" labelledBy="roadmap-dialog-title" busy={saving} onClose={() => setOpen(false)}>
            <header><div><h2 id="roadmap-dialog-title">{selected ? "تعديل المشروع" : "مشروع جديد"}</h2>{selected && <p>{selected.name_ar}</p>}</div><button type="button" disabled={saving} aria-label="إغلاق" onClick={() => setOpen(false)}>×</button></header>
            {error && <p role="alert" className="roadmap-alert">{error}</p>}

            <form onSubmit={save} className="roadmap-form compact-form" onInvalidCapture={event => {
              const disclosure = event.target instanceof HTMLElement ? event.target.closest("details") : null;
              if (disclosure) disclosure.open = true;
            }}>
              <PortfolioProjectFields form={form} onChange={setForm} creating={!selected} />
              {selected?.archived_at && <p className="wide detail-hint">المشروع ضمن المحفظة المؤرشفة{selected.archive_reason ? ` — ${selected.archive_reason}` : ""}. الأرشفة مستقلة عن حالة التنفيذ ولا تُدار من هذا النموذج.</p>}

              <footer>
                <button type="button" disabled={saving} onClick={() => setOpen(false)}>إلغاء</button>
                {canManage && <button className="roadmap-primary" disabled={saving}>{saving ? "جاري الحفظ…" : selected ? "حفظ التعديلات" : "إنشاء المشروع"}</button>}
              </footer>
            </form>
        </AccessibleDialog>
      )}
    <AssessmentFindingLinks/></main>
  );
}

