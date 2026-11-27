"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { portfolioFiltersFrom, portfolioHref, projectHref, registerState, roadmapFocus } from "@/lib/strategy-navigation";
import { projectCount } from "@/lib/arabic-count";
import { matchesPortfolioFilters, type PortfolioFilterProject } from "@/lib/project-portfolio";
import { PortfolioFilters, PortfolioTabs } from "../portfolio-workspace";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, unavailable, type ReadStatus } from "@/lib/strategy-read";
import { readCanonicalEdges, type CanonicalEdges } from "@/lib/strategy-portfolio-read";
import { ReadNotice } from "../read-state";
import { averageProgress } from "../portfolio-metrics";
import { durationLabel, executionYearFor, executionYearText, executionYears, executiveOwnerLabel, isLegacyProject, matchesScope, scopedRequirementCounts, projectStatusText as statusText, workTypeText, type PortfolioFields } from "@/lib/portfolio-analytics";
import "../roadmap.css";
import styles from "./annual-roadmap.module.css";

type Project = PortfolioFields & PortfolioFilterProject & {
  id: number;
  project_code: string;
  name_ar: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  progress_percent: number;
};
type LinkRow = { project_id: number; control_id: number };
type Year = typeof executionYears[number];
const previewSize = 6;

const projectColumns = "id,project_code,name_ar,status,progress_percent,portfolio_priority,execution_year,work_type,executive_owner_code,executive_owner_other,duration_value,duration_unit,archived_at,mapping_completeness";

export default function RoadmapDashboard() {
  return <Suspense fallback={<p>جاري التحميل...</p>}><RoadmapDashboardContent /></Suspense>;
}

function RoadmapDashboardContent() {
  const router = useRouter();
  const params = useSearchParams();
  const focus = roadmapFocus(params);
  const focusId = focus?.id;
  const filters = useMemo(() => portfolioFiltersFrom(registerState(params)), [params]);
  const scope = filters.archive;
  const yearHeadings = useRef(new Map<string, HTMLHeadingElement>());
  const reports = useRef<HTMLDetailsElement>(null);
  const reportsButton = useRef<HTMLElement>(null);
  const [mobileSelection, setMobileSelection] = useState<{ year: Year; context: string } | null>(null);
  const [expanded, setExpanded] = useState<Partial<Record<Year, boolean>>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canonical, setCanonical] = useState<CanonicalEdges | null>(null);
  const [reads, setReads] = useState<{ projects: ReadStatus; links: ReadStatus }>({ projects: "UNAVAILABLE", links: "UNAVAILABLE" });
  const projectsReady = reads.projects === "COMPLETE";
  const linksReady = projectsReady && reads.links === "COMPLETE";
  const exportReady = projectsReady && linksReady;

  useEffect(() => {
    if (loading || error || !focusId) return;
    // Target the compact year heading. One post-render scroll per context/load.
    const frame = requestAnimationFrame(() => {
      yearHeadings.current.get(focusId)?.scrollIntoView({ behavior: "instant", block: "start", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, error, focusId]);

  const projectLink = (project: Project) => {
    const year = executionYearFor(project.portfolio_priority);
    const context = new URLSearchParams(params.toString());
    if (year) context.set("focus_year", String(year));
    else context.delete("focus_year");
    return projectHref(project.id, "roadmap", context);
  };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await requireProfile();
        const [projectResult, linkResult, activeControlResult] = await Promise.all([
          readStrategyRows((from, to) => supabase.from("cybersecurity_projects").select(projectColumns, { count: "exact" }).order("portfolio_priority", { nullsFirst: false }).order("project_code").order("id").range(from, to), row => row.id),
          readStrategyRows((from, to) => supabase.from("cybersecurity_project_controls").select("project_id,control_id", { count: "exact" }).order("project_id").order("control_id").range(from, to), row => `${row.project_id}:${row.control_id}`),
          readStrategyRows((from, to) => supabase.from("controls").select("id,frameworks!inner(is_active)", { count: "exact" }).eq("frameworks.is_active",true).order("id").range(from, to), row => row.id),
        ]);
        const edges = projectResult.status === "COMPLETE" ? await readCanonicalEdges() : null;
        if (live) {
          setError(projectResult.error ? "غير متاح — تعذر تحميل المشاريع." : "");
          setReads({ projects: projectResult.status, links: linkResult.status === "COMPLETE" && activeControlResult.status === "COMPLETE" ? "COMPLETE" : "UNAVAILABLE" });
          const activeIds = new Set((activeControlResult.data ?? []).map(row => row.id));
          const visibleProjects = new Set(projectResult.data.map(row => row.id));
          setProjects((projectResult.data ?? []) as Project[]);
          setLinks((linkResult.data ?? []).filter(row => visibleProjects.has(row.project_id) && activeIds.has(row.control_id)) as LinkRow[]);
          setCanonical(edges);
        }
      } catch (cause) {
        if (!live) return;
        const detail = cause instanceof Error ? cause.message : "تعذر تحميل خارطة طريق المشاريع.";
        if (detail.includes("تسجيل الدخول")) {
          router.replace("/login");
          return;
        }
        setError("غير متاح — تعذر تحميل هذا الجزء.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [router]);

  // Displayed scope: active portfolio by default, narrowed by the filters. Every
  // KPI below (including requirement-derived controls) counts exactly these projects.
  const visible = useMemo(() => projects.filter((project) => matchesPortfolioFilters(project, filters)), [projects, filters]);
  const scopeCount = projects.filter(project => matchesScope(project, scope)).length;
  const modern = useMemo(() => scopedRequirementCounts(canonical, visible), [canonical, visible]);
  const data = useMemo(() => {
    const ids = new Set(visible.map((project) => project.id));
    return {
      average: averageProgress(visible),
      active: visible.filter((project) => project.status === "in_progress").length,
      complete: visible.filter((project) => project.status === "completed").length,
      controls: new Set(links.filter((link) => ids.has(link.project_id)).map((link) => link.control_id)).size,
      unplanned: visible.filter(isLegacyProject),

    };
  }, [visible, links]);
  const lanes = useMemo(() => executionYears.map(year => ({
    year,
    projects: visible.filter(project => executionYearFor(project.portfolio_priority) === year),
  })), [visible]);
  const context = params.toString();
  const selectedYear = mobileSelection?.context === context ? mobileSelection.year
    : lanes.find(lane => String(lane.year) === focus?.year)?.year
      ?? lanes.find(lane => lane.projects.length > 0)?.year ?? executionYears[0];
  const noPriorityParams = new URLSearchParams(context);
  noPriorityParams.delete("execution_year");
  noPriorityParams.set("priority", "unset");

  function closeReports() {
    if (reports.current) reports.current.open = false;
    reportsButton.current?.focus();
  }

  const exportCsv = () => {
    if (!exportReady || !visible.length) return;
    closeReports();
    const quote = (value: unknown) => {
      const text = String(value ?? "");
      // Treat spreadsheet formula-like project text as text in CSV readers.
      const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = [
      ["رمز المشروع", "المشروع", "الأولوية", "سنة التنفيذ", "مدة المشروع", "نوع العمل", "المالك التنفيذي", "الحالة", "نسبة الإنجاز", "الضوابط ذات الربط المباشر المسجّل"],
      ...visible.map((project) => {
        const year = executionYearFor(project.portfolio_priority);
        return [project.project_code, project.name_ar, project.portfolio_priority ?? "", year ? executionYearText[year] : "", durationLabel(project) ?? "", project.work_type ? workTypeText[project.work_type as keyof typeof workTypeText] ?? project.work_type : "", executiveOwnerLabel(project) ?? "", statusText[project.status], `${project.progress_percent}%`, links.filter((link) => link.project_id === project.id).length];
      }),
    ];
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "خارطة-طريق-المشاريع.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحميل خارطة طريق المشاريع…</p></main>;
  }

  return (
    <main className={`roadmap-page ${styles.page}`} dir="rtl">
      <section className="roadmap-shell">
        <PortfolioTabs current="roadmap" params={params} />

        <header className={styles.heading}>
          <div><h1>خارطة طريق المشاريع</h1><p>توزيع المشاريع على ثلاث سنوات حسب الأولوية.</p></div>
          <details ref={reports} className={styles.reports} onKeyDown={event => {
            if (event.key === "Escape" && event.currentTarget.open) { event.preventDefault(); closeReports(); }
          }}>
            <summary ref={reportsButton}>التقارير</summary>
            <div className={styles.reportMenu}>
              <Link href="/roadmap/executive">العرض التنفيذي العام ←</Link>
              <button type="button" disabled={!projectsReady || !visible.length} onClick={() => { closeReports(); window.print(); }}>طباعة / حفظ PDF</button>
              <button type="button" disabled={!exportReady || !visible.length} onClick={exportCsv}>تصدير CSV ‏(Excel)</button>
              {projectsReady && visible.length > 0 && !exportReady && <small>تصدير CSV غير متاح حتى تكتمل قراءة الروابط.</small>}
            </div>
          </details>
        </header>

        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        {!error && <ReadNotice statuses={[reads.projects]} />}
        <div className={styles.filterRegion}><PortfolioFilters current="roadmap" params={params} count={projectsReady ? visible.length : null} total={scopeCount} compact countNote={projectsReady && data.unplanned.length ? `بلا أولوية: ${data.unplanned.length}` : undefined} /></div>

        {projectsReady && <>
          <section className={styles.board} aria-label="توزيع المشاريع حسب سنة التنفيذ">
            <div className={styles.yearPicker} aria-label="اختيار سنة العرض" role="group">
              {lanes.map(lane => <button key={lane.year} type="button" aria-pressed={selectedYear === lane.year} aria-controls={`roadmap-year-${lane.year}`} onClick={() => setMobileSelection({ year: lane.year, context })}><span>{executionYearText[lane.year]}</span><b>{lane.projects.length}</b></button>)}
            </div>
            <div className={styles.grid}>
              {lanes.map(({ year, projects: laneProjects }) => {
                const id = `roadmap-year-${year}`;
                const open = Boolean(expanded[year]);
                return <section className={styles.lane} key={year} id={id} aria-labelledby={`${id}-heading`} data-reading-focus={focusId === id || undefined} data-mobile-selected={selectedYear === year}>
                  <header className={styles.laneHead}>
                    <h2 id={`${id}-heading`} ref={element => {
                      if (element) yearHeadings.current.set(id, element);
                      else yearHeadings.current.delete(id);
                    }}><bdi>{executionYearText[year]}</bdi><bdi className={`register-priority P${year}`}>P{year}</bdi></h2>
                    <span>{projectCount(laneProjects.length)}</span>
                  </header>
                  {laneProjects.length > 0 ? <ul className={styles.projects} id={`${id}-projects`}>
                    {laneProjects.map((project, index) => <li key={project.id} className={styles.item} data-preview-hidden={!open && index >= previewSize}>
                      <Link href={projectLink(project)} className={styles.card} title={`${project.project_code} — ${project.name_ar}`}>
                        <strong>{project.name_ar}</strong>
                        <span className={styles.cardMeta}>
                          <span className={styles.status} data-status={project.status}>{statusText[project.status]}</span>
                          {project.archived_at && <span className={styles.archived}>مؤرشف</span>}
                          <bdi className={styles.progress} aria-label={`التقدم ${project.progress_percent}%`}>{project.progress_percent}%</bdi>
                        </span>
                      </Link>
                    </li>)}
                  </ul> : <p className={styles.empty}>لا توجد مشاريع ضمن الفلاتر لهذه السنة.</p>}
                  {laneProjects.length > previewSize && <button type="button" className={styles.more} aria-expanded={open} aria-controls={`${id}-projects`} onClick={() => setExpanded(previous => ({ ...previous, [year]: !open }))}>{open ? "عرض أقل" : `عرض المزيد (${laneProjects.length - previewSize})`}</button>}
                </section>;
              })}
            </div>
          </section>

          {data.unplanned.length > 0 && <aside className={styles.unplanned}>
            <div><h2>مشاريع بلا أولوية</h2><p>بانتظار تحديد الأولوية لإدراجها في الخطة · {projectCount(data.unplanned.length)}.</p></div>
            <Link href={portfolioHref("register", noPriorityParams)}>عرض في السجل ←</Link>
            <ul className={styles.printUnplanned}>
              {data.unplanned.map(project => <li key={project.id}>{project.name_ar} · {statusText[project.status]} · <bdi>{project.progress_percent}%</bdi></li>)}
            </ul>
          </aside>}

          {visible.length > 0 && <details className={styles.summary}>
            <summary>ملخص المشاريع المعروضة</summary>
            <ReadNotice statuses={[reads.links, modern ? "COMPLETE" : "UNAVAILABLE"]} />
            <dl>
              <div><dt>قيد التنفيذ</dt><dd>{data.active}</dd></div>
              <div><dt>مكتملة</dt><dd>{data.complete}</dd></div>
              <div><dt>متوسط التقدم المسجّل</dt><dd><bdi>{data.average}%</bdi></dd></div>
              <div><dt>ضوابط ذات ربط مباشر</dt><dd>{linksReady ? data.controls : unavailable}</dd></div>
              <div><dt>ضوابط عبر المتطلبات</dt><dd>{modern?.controls ?? unavailable}</dd></div>
            </dl>
            <p>التقدم متوسط غير مرجّح، والربط بالضوابط لا يعني تحقق الالتزام.</p>
          </details>}
        </>}
      </section>
    </main>
  );
}
