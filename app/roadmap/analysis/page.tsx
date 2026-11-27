"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { portfolioFiltersFrom, portfolioHref, projectHref, registerState } from "@/lib/strategy-navigation";
import { matchesPortfolioFilters, priorityLabels, type PortfolioFilterProject } from "@/lib/project-portfolio";
import { PortfolioFilters, PortfolioTabs } from "../portfolio-workspace";
import { useRouter, useSearchParams } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, unavailable, type ReadStatus } from "@/lib/strategy-read";
import { ReadNotice } from "../read-state";
import { planningReadiness, planningReadinessItems } from "../portfolio-metrics";
import { dimensionText, durationBreakdown, matchesScope, portfolioBreakdown, scopedRequirementCounts, type PortfolioDimension, type PortfolioFields } from "@/lib/portfolio-analytics";
import { projectCount } from "@/lib/arabic-count";
import { readCanonicalEdges, type CanonicalEdges } from "@/lib/strategy-portfolio-read";
import "../roadmap.css";
import styles from "./portfolio-analysis.module.css";

type Project = PortfolioFields & PortfolioFilterProject & {
  id: number;
  project_code: string;
  name_ar: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  target_outcome: string | null;
  recommended_technologies: string | null;
  progress_percent: number;
};
const dimensions = ["executive_owner", "status", "work_type", "priority"] as const satisfies readonly PortfolioDimension[];
type BreakdownDimension = typeof dimensions[number];
const missingLabels = { priority: "الأولوية", owner: "الجهة المالكة", duration: "مدة المشروع", outcome: "النتيجة المستهدفة" };
const dimensionLabel = { ...dimensionText, priority: "سنة التنفيذ والأولوية" };
const filterKey = { executive_owner: "owner", status: "status", work_type: "work_type", priority: "priority" };
const ownerNames: Record<string, string> = { it: "تقنية المعلومات", cybersecurity: "الأمن السيبراني", dmo: "مكتب إدارة البيانات", other: "أخرى" };
const absentLabels = { executive_owner: "بلا جهة مالكة", status: "بلا حالة مسجّلة", work_type: "بلا نوع عمل", priority: "بلا أولوية" };
const previewSize = 3;
type ControlLink = { project_id: number; control_id: number };
type Treatment = { project_id: number; priority: "high" | "medium" | "low" };

export default function PortfolioAnalysisPage() {
  return <Suspense fallback={<main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحميل تحليل المحفظة…</p></main>}><PortfolioAnalysisContent /></Suspense>;
}

function PortfolioAnalysisContent() {
  const router = useRouter();
  const params = useSearchParams();
  const filters = useMemo(() => portfolioFiltersFrom(registerState(params)), [params]);
  const scope = filters.archive;
  const [projects, setProjects] = useState<Project[]>([]);
  const [links, setLinks] = useState<ControlLink[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [canonical, setCanonical] = useState<CanonicalEdges | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartBy, setChartBy] = useState<BreakdownDimension>("executive_owner");
  const [showAll, setShowAll] = useState(false);
  const [reads, setReads] = useState<{ projects: ReadStatus; links: ReadStatus; treatments: ReadStatus }>({ projects: "UNAVAILABLE", links: "UNAVAILABLE", treatments: "UNAVAILABLE" });
  const projectsReady = reads.projects === "COMPLETE";
  const linksReady = projectsReady && reads.links === "COMPLETE";
  const treatmentsReady = reads.treatments === "COMPLETE";
  const planningReady = projectsReady && linksReady;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await requireProfile();
        const [projectResult, linkResult, treatmentResult, activeControlResult] = await Promise.all([
          readStrategyRows((from, to) => supabase.from("cybersecurity_projects").select("id,project_code,name_ar,status,target_outcome,recommended_technologies,progress_percent,portfolio_priority,execution_year,work_type,executive_owner_code,executive_owner_other,duration_value,duration_unit,archived_at,mapping_completeness", { count: "exact" }).order("portfolio_priority", { nullsFirst: false }).order("id").range(from, to), row => row.id),
          readStrategyRows((from, to) => supabase.from("cybersecurity_project_controls").select("project_id,control_id", { count: "exact" }).order("project_id").order("control_id").range(from, to), row => `${row.project_id}:${row.control_id}`),
          readStrategyRows((from, to) => supabase.from("cybersecurity_project_gap_treatments").select("id,project_id,priority", { count: "exact" }).order("id").range(from, to), row => row.id),
          readStrategyRows((from, to) => supabase.from("controls").select("id,frameworks!inner(is_active)", { count: "exact" }).eq("frameworks.is_active",true).order("id").range(from, to), row => row.id),
        ]);
        const edges = projectResult.status === "COMPLETE" ? await readCanonicalEdges() : null;
        if (live) {
          setReads({ projects: projectResult.status, links: linkResult.status === "COMPLETE" && activeControlResult.status === "COMPLETE" ? "COMPLETE" : "UNAVAILABLE", treatments: treatmentResult.status });
          setCanonical(edges);
          const activeIds = new Set((activeControlResult.data ?? []).map(row => row.id));
          const visibleProjects = new Set(projectResult.data.map(row => row.id));
          setProjects((projectResult.data ?? []) as Project[]);
          setLinks((linkResult.data ?? []).filter(row => visibleProjects.has(row.project_id) && activeIds.has(row.control_id)) as ControlLink[]);
          setTreatments((treatmentResult.data ?? []) as Treatment[]);
        }
      } catch (cause) {
        if (!live) return;
        const detail = cause instanceof Error ? cause.message : "تعذر تحميل تحليل المحفظة.";
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

  // Analysis covers the selected portfolio scope (active by default), narrowed by
  // the filters. Every KPI and breakdown, including requirement-derived controls
  // and durations, counts exactly these projects.
  const scoped = useMemo(() => projects.filter((project) => matchesPortfolioFilters(project, filters)), [projects, filters]);
  const scopeCount = projects.filter(project => matchesScope(project, scope)).length;
  const modern = useMemo(() => scopedRequirementCounts(canonical, scoped), [canonical, scoped]);
  const durations = useMemo(() => durationBreakdown(scoped), [scoped]);
  const analysis = useMemo(() => {
    const mapped = new Map<number, number>();
    links.forEach(link => mapped.set(link.project_id, (mapped.get(link.project_id) ?? 0) + 1));
    const scopedIds = new Set(scoped.map(project => project.id));
    const rows = projectsReady ? scoped.map(project => ({
      project,
      missing: planningReadinessItems(project, 0)
        .flatMap(item => item.key === "controlLink" || item.complete ? [] : [missingLabels[item.key]]),
    })) : [];
    const readiness = planningReady ? scoped.map(project => planningReadiness(project, mapped.get(project.id) ?? 0)) : [];
    return {
      incomplete: rows.filter(row => row.missing.length).sort((a, b) => b.missing.length - a.missing.length || a.project.id - b.project.id),
      readiness: readiness.length ? Math.round(readiness.reduce((sum, value) => sum + value, 0) / readiness.length) : null,
      fullyRecorded: readiness.filter(value => value === 100).length,
      withoutDirectLinks: scoped.filter(project => !mapped.has(project.id)).length,
      linkedControls: new Set(links.filter(link => scopedIds.has(link.project_id)).map(link => link.control_id)).size,
      highTreatments: treatments.filter(item => item.priority === "high" && scopedIds.has(item.project_id)).length,
    };
  }, [scoped, links, treatments, projectsReady, planningReady]);
  const distribution = useMemo(() => portfolioBreakdown(scoped, chartBy), [scoped, chartBy]);
  const series = distribution.rows.filter(row => row.count > 0).map(row => ({
    ...row,
    label: chartBy === "executive_owner" ? ownerNames[row.value] ?? row.label
      : chartBy === "priority" ? priorityLabels[row.value as keyof typeof priorityLabels] ?? row.label : row.label,
  }));
  if (distribution.unset > 0) series.push({ value: "unset", label: absentLabels[chartBy], count: distribution.unset });

  function registerSlice(value: string) {
    const context = new URLSearchParams(params.toString());
    context.set(filterKey[chartBy], value);
    if (chartBy === "priority") context.delete("execution_year");
    return portfolioHref("register", context);
  }

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading" role="status">جاري تحميل تحليل المحفظة…</p></main>;
  }

  return (
    <main className={`roadmap-page ${styles.page}`} dir="rtl">
      <section className="roadmap-shell">
        <PortfolioTabs current="analysis" params={params} />
        <header className={styles.heading}>
          <h1>تحليل المحفظة</h1>
          <p>اعرف ما يحتاج استكمالًا، وكيف تتوزع المشاريع المعروضة.</p>
        </header>
        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        {!error && <ReadNotice statuses={[reads.projects]} />}
        <PortfolioFilters current="analysis" params={params} count={projectsReady ? scoped.length : null} total={scopeCount} compact />

        {projectsReady && <>
          <section className={`${styles.panel} ${styles.actions}`} aria-labelledby="portfolio-actions-title">
            <div className={styles.panelHeader}>
              <div><h2 id="portfolio-actions-title">مشاريع تحتاج استكمالًا</h2><p>ابدأ بالبيانات الناقصة لكل مشروع.</p></div>
              <span className={styles.count} data-attention={analysis.incomplete.length > 0}>{projectCount(analysis.incomplete.length)}</span>
            </div>
            {analysis.incomplete.length > 0 ? <>
              <ul className={styles.actionList} id="portfolio-action-list">
                {(showAll ? analysis.incomplete : analysis.incomplete.slice(0, previewSize)).map(({ project, missing }) =>
                  <li key={project.id}>
                    <Link href={projectHref(project.id, "analysis", params)} className={styles.actionLink}>
                      <span><strong>{project.name_ar}</strong><small><bdi>{project.project_code}</bdi>{project.archived_at && " · مؤرشف"}</small></span>
                      <span className={styles.missing}><span className={styles.srOnly}>حقول ناقصة</span>{missing.map(label => <span key={label}>{label}</span>)}</span>
                      <span className={styles.open} aria-hidden="true">فتح ←</span>
                    </Link>
                  </li>
                )}
              </ul>
              {analysis.incomplete.length > previewSize && <button type="button" className={styles.disclosure} aria-expanded={showAll} aria-controls="portfolio-action-list" onClick={() => setShowAll(previous => !previous)}>
                {showAll ? "عرض مختصر" : `عرض كل المشاريع التي تحتاج استكمالًا (${analysis.incomplete.length})`}
              </button>}
            </> : <p className={styles.empty}>{scoped.length ? "لا توجد حقول تخطيط ناقصة في المشاريع المعروضة." : "لا توجد مشاريع تطابق الفلاتر الحالية."}</p>}
          </section>

          <section className={styles.panel} aria-labelledby="portfolio-breakdown-title">
            <div className={styles.panelHeader}>
              <div><h2 id="portfolio-breakdown-title">توزيع المشاريع</h2><p>اختر فئة لعرض مشاريعها في السجل.</p></div>
              <label className={styles.dimension}><span>عرض حسب</span><select value={chartBy} onChange={event => {
                const value = dimensions.find(dimension => dimension === event.target.value);
                if (value) setChartBy(value);
              }}>{dimensions.map(dimension => <option key={dimension} value={dimension}>{dimensionLabel[dimension]}</option>)}</select></label>
            </div>
            {series.length > 0 ? <ul className={styles.chart} aria-label={`توزيع المشاريع حسب ${dimensionLabel[chartBy]}`}>
              {series.map(row => {
                const content = <>
                  <span className={styles.category}>{row.label}</span>
                  <span className={styles.track} aria-hidden="true"><span style={{ inlineSize: `${100 * row.count / scoped.length}%` }} /></span>
                  <strong><bdi>{row.count}</bdi></strong>
                </>;
                return <li key={row.value}>
                  {chartBy === "status" && row.value === "unset" ? <span className={styles.chartRow}>{content}</span>
                    : <Link className={styles.chartRow} href={registerSlice(row.value)} aria-label={`${row.label}، ${projectCount(row.count)}، عرض في السجل`}>{content}</Link>}
                </li>;
              })}
            </ul> : <p className={styles.empty}>لا توجد نتائج لعرض التوزيع.</p>}
          </section>

          {scoped.length > 0 && <div className={styles.secondary}>
            <details>
              <summary>المدد المسجّلة</summary>
              {!durations.groups.length ? <p>لا توجد مدد مسجّلة للمشاريع المعروضة.</p> : <>
                <p>تُعرض المدد بوحداتها المسجّلة، دون تحويل بين الوحدات.</p>
                <div className={styles.durationGroups}>
                  {durations.groups.map(group => <table key={group.unit} aria-label={`مدد المشاريع بوحدة ${group.label}`}>
                    <caption>{group.label} · {projectCount(group.count)}<small>الأدنى <bdi>{group.min}</bdi> · الوسيط <bdi>{group.median}</bdi> · الأعلى <bdi>{group.max}</bdi></small></caption>
                    <thead><tr><th scope="col">المدة</th><th scope="col">المشاريع</th></tr></thead>
                    <tbody>{group.values.map(row => <tr key={row.value}><td><bdi>{row.label}</bdi></td><td>{row.count}</td></tr>)}</tbody>
                  </table>)}
                </div>
              </>}
              {durations.unset > 0 && <p>بلا مدة مسجّلة · {projectCount(durations.unset)}</p>}
            </details>
            <details>
              <summary>الربط بالضوابط والمعالجات</summary>
              <ReadNotice statuses={[reads.links, reads.treatments, modern ? "COMPLETE" : "UNAVAILABLE"]} />
              <dl className={styles.metricList}>
                <div><dt>ضوابط ذات ربط مباشر</dt><dd>{linksReady ? analysis.linkedControls : unavailable}</dd></div>
                <div><dt>ضوابط عبر المتطلبات</dt><dd>{modern?.controls ?? unavailable}</dd></div>
                <div><dt>مشاريع بلا ربط مباشر</dt><dd>{linksReady ? analysis.withoutDirectLinks : unavailable}</dd></div>
                <div><dt>معالجات عالية الأولوية</dt><dd>{treatmentsReady ? analysis.highTreatments : unavailable}</dd></div>
              </dl>
              <p>الربط المباشر والربط عبر المتطلبات مساران منفصلان. غياب الربط المباشر لا ينفي وجود ربط عبر المتطلبات، ووجود الربط لا يعني التحقق من تطبيق الضابط.</p>
              <details className={styles.method}>
                <summary>كيف يُحسب اكتمال عناصر التخطيط؟</summary>
                <p>{analysis.readiness === null ? unavailable : <>متوسط الاكتمال <bdi>{analysis.readiness}%</bdi> · اكتملت العناصر الخمسة في <bdi>{analysis.fullyRecorded}/{scoped.length}</bdi> من المشاريع.</>}</p>
                <p>يشمل المؤشر الأولوية والجهة المالكة والمدة والنتيجة المستهدفة ورابطًا مباشرًا بضابط، بأوزان متساوية. لا يقيس جاهزية التنفيذ أو الالتزام.</p>
              </details>
            </details>
          </div>}
        </>}
      </section>
    </main>
  );
}
