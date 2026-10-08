"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { projectHref, roadmapFocus } from "@/lib/strategy-navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, unavailable, type ReadStatus } from "@/lib/strategy-read";
import { readCanonicalEdges, type CanonicalEdges } from "@/lib/strategy-portfolio-read";
import { projectCount } from "@/lib/arabic-count";
import { ReadNotice, ReadSection } from "../read-state";
import { FilterBar, FilterSelect, PageHeader, priorityYearOptions, RoadmapTabs, StatusChip, SummaryStrip, type SummaryItem } from "../portfolio-ui";
import { showCardStatus, showProgress } from "@/lib/roadmap-presentation";
import { dimensionOptions, durationLabel, executionYearFor, executionYearText, executionYears, executiveOwnerLabel, isArchived, isLegacyProject, isPortfolioScope, matchesPortfolioFilters, matchesScope, scopedRequirementCounts, type PortfolioScope, projectStatusText as statusText, workTypeText, type PortfolioDimension, type PortfolioFields } from "@/lib/portfolio-analytics";
import "../roadmap.css";

type Project = PortfolioFields & {
  id: number;
  project_code: string;
  name_ar: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  progress_percent: number;
};
type LinkRow = { project_id: number; control_id: number };

const projectColumns = "id,project_code,name_ar,status,progress_percent,portfolio_priority,execution_year,work_type,executive_owner_code,executive_owner_other,duration_value,duration_unit,archived_at";

export default function RoadmapDashboard() {
  return <Suspense fallback={<p>جاري التحميل...</p>}><RoadmapDashboardContent /></Suspense>;
}

function RoadmapDashboardContent() {
  const router = useRouter();
  const params = useSearchParams();
  const focusId = roadmapFocus(params)?.id;
  const yearHeadings = useRef(new Map<string, HTMLHeadingElement>());
  const [filters, setFilters] = useState<Record<PortfolioDimension, string>>({ priority: "all", execution_year: "all", work_type: "all", executive_owner: "all", status: "all" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canonical, setCanonical] = useState<CanonicalEdges | null>(null);
  const [scope, setScope] = useState<PortfolioScope>("active");
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
    return projectHref(project.id, "roadmap", new URLSearchParams(year ? { focus_year: String(year) } : {}));
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
  const visible = useMemo(() => projects.filter((project) => matchesScope(project, scope) && matchesPortfolioFilters(project, filters)), [projects, scope, filters]);
  const modern = useMemo(() => scopedRequirementCounts(canonical, visible), [canonical, visible]);
  const data = useMemo(() => {
    const ids = new Set(visible.map((project) => project.id));
    return {
      controls: new Set(links.filter((link) => ids.has(link.project_id)).map((link) => link.control_id)).size,
      unplanned: visible.filter(isLegacyProject),
      archived: projects.filter(isArchived).length,
    };
  }, [projects, visible, links]);

  const exportExcel = () => {
    if (!exportReady) return;
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
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

  const summaryItems: SummaryItem[] = [
    { label: "المشاريع", value: projectsReady ? visible.length : unavailable },
    ...(projectsReady && scope === "active" && data.archived > 0 ? [{ label: "مؤرشفة (خارج العرض)", value: data.archived, href: "/roadmap?archive=archived" }] : []),
    ...(projectsReady && data.unplanned.length > 0 ? [{ label: "بلا أولوية", value: data.unplanned.length, tone: "attention" as const }] : []),
    ...(!linksReady || data.controls > 0 ? [{ label: "ضوابط بربط مباشر", value: linksReady ? data.controls : unavailable }] : []),
    ...(modern && modern.controls > 0 ? [{ label: "ضوابط عبر المتطلبات", value: modern.controls }] : []),
  ];

  return (
    <main className="roadmap-page rm-page roadmap-executive" dir="rtl">
      <section className="roadmap-shell">
        <RoadmapTabs active="/roadmap/dashboard" />
        <PageHeader title="خارطة طريق المشاريع" description="ما يُنفَّذ في كل سنة ومن يملكه؛ سنة التنفيذ مشتقة من الأولوية ولا تمثل اعتماديات أو تسلسلًا داخل السنة." actions={<>
          <button type="button" className="roadmap-secondary" disabled={!exportReady} title={!exportReady ? "التصدير غير متاح حتى تكتمل القراءات" : undefined} onClick={exportExcel}>تصدير Excel</button>
          <button type="button" className="roadmap-secondary" disabled={!exportReady} title={!exportReady ? "التصدير غير متاح حتى تكتمل القراءات" : undefined} onClick={() => { if (exportReady) window.print(); }}>تصدير PDF</button>
          <Link href="/roadmap/executive" className="roadmap-primary">ملخص الإدارة العليا</Link>
        </>} />
        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        <ReadNotice statuses={[reads.projects, reads.links, modern ? "COMPLETE" : "UNAVAILABLE"]} />

        <SummaryStrip label="ملخص خارطة طريق المشاريع" items={summaryItems} />

        <FilterBar label="تصفية خارطة طريق المشاريع" count={projectsReady ? projectCount(visible.length) : unavailable}>
          <FilterSelect label="المحفظة" value={scope} onChange={(value) => { if (isPortfolioScope(value)) setScope(value); }} options={{ active: "النشطة", archived: "المؤرشفة", all: "الكل" }} allLabel={null} />
          <FilterSelect label="الأولوية / سنة التنفيذ" value={filters.priority} onChange={(value) => setFilters({ ...filters, priority: value, execution_year: "all" })} options={priorityYearOptions} />
          <FilterSelect label="نوع العمل" value={filters.work_type} onChange={(value) => setFilters({ ...filters, work_type: value })} options={dimensionOptions.work_type} />
          <FilterSelect label="الجهة المالكة" value={filters.executive_owner} onChange={(value) => setFilters({ ...filters, executive_owner: value })} options={dimensionOptions.executive_owner} />
          <FilterSelect label="الحالة" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={dimensionOptions.status} />
        </FilterBar>

        <ReadSection available={projectsReady}><section className="rm-board" aria-labelledby="year-roadmap-title">
          <h2 id="year-roadmap-title" className="rm-visually-hidden">توزيع المشاريع حسب سنة التنفيذ</h2>
          <div className="year-roadmap-grid">
            {executionYears.map((year) => {
              const id = `roadmap-year-${year}`;
              const yearProjects = visible.filter((project) => executionYearFor(project.portfolio_priority) === year);
              return <section key={year} id={id} aria-labelledby={`${id}-heading`} data-reading-focus={focusId === id || undefined}>
                <header className="rm-year-head"><h3 id={`${id}-heading`} className="quarterly-context-heading" ref={(element) => {
                  if (element) yearHeadings.current.set(id, element);
                  else yearHeadings.current.delete(id);
                }}><bdi>{executionYearText[year]} · P{year}</bdi></h3><small>{projectCount(yearProjects.length)}</small></header>
                {yearProjects.length ? yearProjects.map((project) => <Link href={projectLink(project)} key={project.id} className={`quarterly-project rm-card ${project.status}`} title={`${project.project_code} — ${project.name_ar}`}>
                  <span className="rm-card-top"><bdi className="rm-code" dir="ltr">{project.project_code}</bdi>{showCardStatus(project) && <StatusChip status={project.status} />}</span>
                  <strong>{project.name_ar}</strong>
                  <small className="bidi-meta"><bdi className="rm-nowrap">{executiveOwnerLabel(project) ?? "مالك غير محدد"}</bdi> · <bdi className="rm-nowrap">{durationLabel(project) ?? "مدة غير محددة"}</bdi>{showProgress(project) && <> · <bdi>{`${project.progress_percent}%`}</bdi></>}</small>
                </Link>) : <small className="quarterly-empty">لا توجد مشاريع مسجلة لهذه السنة.</small>}
              </section>;
            })}
          </div>
        </section>

        {data.unplanned.length > 0 && <section className="rm-panel" aria-labelledby="unplanned-title">
          <header><h2 id="unplanned-title">مشاريع بلا أولوية</h2><small>{projectCount(data.unplanned.length)} لا تظهر في السنوات حتى تُحدَّد أولويتها.</small></header>
          <ul className="rm-list">{data.unplanned.slice(0, 6).map((project) => <li key={project.id}><bdi className="rm-code" dir="ltr">{project.project_code}</bdi><Link className="strategy-project-link" href={projectLink(project)}>{project.name_ar}</Link></li>)}</ul>
        </section>}</ReadSection>
      </section>
    </main>
  );
}
