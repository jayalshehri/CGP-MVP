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
import { averageProgress } from "../portfolio-metrics";
import { dimensionOptions, dimensionText, durationLabel, executionYearFor, executionYearText, executionYears, executiveOwnerLabel, isArchived, isLegacyProject, isPortfolioScope, matchesPortfolioFilters, matchesScope, portfolioScopes, scopedRequirementCounts, type PortfolioScope, projectStatusText as statusText, workTypeText, type PortfolioDimension, type PortfolioFields } from "@/lib/portfolio-analytics";
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
const filterDimensions: PortfolioDimension[] = ["priority", "execution_year", "work_type", "executive_owner", "status"];

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
      average: averageProgress(visible),
      active: visible.filter((project) => project.status === "in_progress").length,
      complete: visible.filter((project) => project.status === "completed").length,
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

  return (
    <main className="roadmap-page roadmap-executive" dir="rtl">
      <section className="roadmap-shell">
        <nav className="roadmap-view-tabs" aria-label="إدارة محفظة الأمن السيبراني">
          <Link href="/roadmap">سجل المشاريع السيبرانية</Link>
          <Link href="/roadmap/analysis">تحليل المحفظة السيبرانية</Link>
          <Link className="active" href="/roadmap/dashboard">خارطة طريق المشاريع</Link>
        </nav>

        <header className="roadmap-exec-hero">
          <div><span>خطة التنفيذ · ثلاث سنوات</span><h1>خارطة طريق المشاريع</h1><p>توزيع المشاريع بحسب سنة التنفيذ المشتقة من الأولوية (P1 ← السنة الأولى، P2 ← الثانية، P3 ← الثالثة)؛ لا يمثل اعتماديات أو تسلسل تنفيذ.</p></div>
          <div className="roadmap-export-actions"><button type="button" disabled={!exportReady} title={!exportReady ? "التصدير غير متاح حتى تكتمل القراءات" : undefined} onClick={() => { if (exportReady) window.print(); }}>تصدير PDF</button><button type="button" disabled={!exportReady} onClick={exportExcel}>تصدير Excel</button><Link href="/roadmap/executive" className="roadmap-primary">عرض الإدارة العليا ←</Link><Link href="/roadmap" className="roadmap-secondary">تحديث المشاريع</Link></div>
        </header>
        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        <ReadNotice statuses={[reads.projects, reads.links, modern ? "COMPLETE" : "UNAVAILABLE"]} />

        <section className="register-toolbar" aria-label="تصفية خارطة طريق المشاريع">
          <label><span>المحفظة</span><select value={scope} onChange={(event) => { if (isPortfolioScope(event.target.value)) setScope(event.target.value); }}>{Object.entries(portfolioScopes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {filterDimensions.map((dimension) => <label key={dimension}><span>{dimensionText[dimension]}</span><select value={filters[dimension]} onChange={(event) => setFilters({ ...filters, [dimension]: event.target.value })}><option value="all">الكل</option>{Object.entries(dimensionOptions[dimension]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
          <strong>{projectsReady ? projectCount(visible.length) : unavailable}</strong>
        </section>

        <section className="roadmap-exec-kpis roadmap-snapshot" aria-label="ملخص خارطة طريق المشاريع">
          <Kpi label="المشاريع" value={projectsReady ? visible.length : unavailable} detail={projectsReady ? `${data.active} قيد التنفيذ · ${data.complete} مكتمل` : unavailable} />
          <Kpi label="متوسط تقدم المشاريع المسجّل" value={projectsReady ? `${data.average}%` : unavailable} detail="متوسط غير مرجح من المشاريع" tone="teal" />
          <Kpi label="بلا أولوية P1/P2/P3" value={projectsReady ? data.unplanned.length : unavailable} detail="مسجلة بالنموذج السابق؛ لا تظهر في السنوات" tone="amber" />
          <Kpi label="مشاريع مؤرشفة" value={projectsReady ? data.archived : unavailable} detail={scope === "active" ? "إجمالي المحفظة المؤرشفة؛ مستبعدة من النطاق المعروض" : "إجمالي المحفظة المؤرشفة"} />
          <Kpi label="ضوابط ذات ربط مباشر مسجّل" value={linksReady ? data.controls : unavailable} detail="من سجل الربط المباشر؛ لا تعني تحقق الالتزام" tone="blue" />
          <Kpi label="ضوابط مميزة عبر المتطلبات" value={modern?.controls ?? unavailable} detail="لمشاريع النطاق والفلاتر المعروضة فقط؛ منفصلة عن الربط المباشر" tone="blue" />
        </section>

        <ReadSection available={projectsReady}><section className="quarterly-roadmap" aria-labelledby="year-roadmap-title">
          <header><div><span>العرض التشغيلي</span><h2 id="year-roadmap-title">توزيع المشاريع حسب سنة التنفيذ</h2><p>اللون يوضح حالة التنفيذ، والشارة توضح الأولوية.</p></div></header>
          <div className="year-roadmap-grid">
            {executionYears.map((year) => {
              const id = `roadmap-year-${year}`;
              const yearProjects = visible.filter((project) => executionYearFor(project.portfolio_priority) === year);
              return <section key={year} id={id} aria-labelledby={`${id}-heading`} data-reading-focus={focusId === id || undefined}>
                <h3 id={`${id}-heading`} className="quarterly-context-heading" ref={(element) => {
                  if (element) yearHeadings.current.set(id, element);
                  else yearHeadings.current.delete(id);
                }}><bdi>{executionYearText[year]} · P{year}</bdi></h3>
                {yearProjects.length ? yearProjects.map((project) => <Link href={projectLink(project)} key={project.id} className={`quarterly-project ${project.status}`} title={`${project.project_code} — ${project.name_ar}`}><div><b dir="ltr">{project.project_code}</b><span className={`register-priority ${project.portfolio_priority}`}>{project.portfolio_priority}</span></div><strong>{project.name_ar}</strong><small className="bidi-meta"><bdi>{executiveOwnerLabel(project) ?? "مالك غير محدد"}</bdi> · <bdi>{durationLabel(project) ?? "مدة غير محددة"}</bdi> · <bdi>{`${project.progress_percent}%`}</bdi></small></Link>) : <small className="quarterly-empty">لا توجد مشاريع مسجلة لهذه السنة.</small>}
              </section>;
            })}
          </div>
        </section>

        <section className="roadmap-exceptions">
          <article><header><div><span>جودة الخطة</span><h2>مشاريع تحتاج أولوية</h2></div><b>{data.unplanned.length}</b></header>{data.unplanned.length ? <ul>{data.unplanned.slice(0, 6).map((project) => <li key={project.id}><b dir="ltr">{project.project_code}</b><Link className="strategy-project-link" href={projectLink(project)}>{project.name_ar}</Link><Link href={projectLink(project)}>استكمال ←</Link></li>)}</ul> : <p>جميع المشاريع المعروضة لها أولوية وسنة تنفيذ.</p>}</article>
          <article><header><div><span>القدرة التحليلية</span><h2>At Risk والاعتماديات</h2></div><b>—</b></header><p className="metric-unavailable">غير متاح حتى يُفعّل سجل مخاطر التسليم واعتماديات المشاريع. لن تعرض المنصة رقمًا تقديريًا.</p></article>
        </section></ReadSection>
      </section>
    </main>
  );
}

function Kpi({ label, value, detail, tone = "" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`roadmap-exec-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
