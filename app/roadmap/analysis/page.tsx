"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, unavailable, type ReadStatus } from "@/lib/strategy-read";
import { ReadNotice, ReadSection } from "../read-state";
import { FilterBar, FilterSelect, KpiCard, PageHeader, priorityYearOptions, RoadmapTabs, mappingShortLabels } from "../portfolio-ui";
import { scopedHighTreatments } from "@/lib/portfolio-treatments";
import { managementAttention } from "@/lib/portfolio-attention";
import { categoryMix, mappingDistribution, mappingKeys, plannedLoadMatrix, type LoadOwner } from "@/lib/roadmap-presentation";
import { dimensionOptions, isPortfolioScope, matchesPortfolioFilters, matchesScope, portfolioScopePhrases, scopedRequirementCounts, type PortfolioDimension, type PortfolioFields, type PortfolioScope } from "@/lib/portfolio-analytics";
import { executionYearLabels, mappingCompletenessLabels, ownerLabels, workTypeLabels, type WorkType } from "@/lib/project-portfolio";
import { projectCount } from "@/lib/arabic-count";
import { readCanonicalEdges, type CanonicalEdges } from "@/lib/strategy-portfolio-read";
import "../roadmap.css";

type Project = PortfolioFields & {
  id: number;
  project_code: string;
  name_ar: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  target_outcome: string | null;
  progress_percent: number;
  import_staging_id: string | null;
  mapping_completeness: string | null;
};
type ControlLink = { project_id: number; control_id: number };
type Treatment = { project_id: number; priority: "high" | "medium" | "low" };

const ownerRowLabels: Record<LoadOwner, string> = { ...ownerLabels, unset: "غير محددة" };
const registerScope: Record<PortfolioScope, string> = { active: "", archived: "&archive=archived", all: "&archive=include" };

export default function PortfolioAnalysisPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [links, setLinks] = useState<ControlLink[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [canonical, setCanonical] = useState<CanonicalEdges | null>(null);
  const [scope, setScope] = useState<PortfolioScope>("active");
  const [filters, setFilters] = useState<Record<PortfolioDimension, string>>({ priority: "all", execution_year: "all", work_type: "all", executive_owner: "all", status: "all" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reads, setReads] = useState<{ projects: ReadStatus; links: ReadStatus; treatments: ReadStatus }>({ projects: "UNAVAILABLE", links: "UNAVAILABLE", treatments: "UNAVAILABLE" });
  const projectsReady = reads.projects === "COMPLETE";
  const linksReady = projectsReady && reads.links === "COMPLETE";
  const treatmentsReady = reads.treatments === "COMPLETE";

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await requireProfile();
        const [projectResult, linkResult, treatmentResult, activeControlResult] = await Promise.all([
          readStrategyRows((from, to) => supabase.from("cybersecurity_projects").select("id,project_code,name_ar,status,target_outcome,progress_percent,portfolio_priority,execution_year,work_type,executive_owner_code,executive_owner_other,duration_value,duration_unit,archived_at,import_staging_id,mapping_completeness", { count: "exact" }).order("portfolio_priority", { nullsFirst: false }).order("id").range(from, to), row => row.id),
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

  // Every figure below covers the selected scope (active by default) narrowed by
  // the filters; archived projects never enter the active-portfolio figures.
  const scoped = useMemo(() => projects.filter((project) => matchesScope(project, scope) && matchesPortfolioFilters(project, filters)), [projects, scope, filters]);
  const modern = useMemo(() => scopedRequirementCounts(canonical, scoped), [canonical, scoped]);
  const analysis = useMemo(() => ({
    p1: scoped.filter((project) => project.portfolio_priority === "P1").length,
    load: plannedLoadMatrix(scoped),
    workTypes: categoryMix(scoped, "work_type", Object.keys(workTypeLabels) as WorkType[]),
    mapping: mappingDistribution(scoped),
    attention: managementAttention(scoped, links, treatments, { links: linksReady, treatments: treatmentsReady }),
    highTreatments: scopedHighTreatments(treatments, scoped).length,
  }), [scoped, links, treatments, linksReady, treatmentsReady]);
  const attentionReady = linksReady && treatmentsReady;
  const year1 = analysis.load.totals[0];

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحليل محفظة المشاريع…</p></main>;
  }

  return (
    <main className="roadmap-page rm-page portfolio-analysis" dir="rtl">
      <section className="roadmap-shell">
        <RoadmapTabs active="/roadmap/analysis" />
        <PageHeader title="تحليل المحفظة السيبرانية" description="هل الخطة متوازنة؟ أين يتركز الحمل التخطيطي؟ وما الذي يحتاج قرارًا؟" />
        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        <ReadNotice statuses={[reads.projects, reads.links, reads.treatments, modern ? "COMPLETE" : "UNAVAILABLE"]} />

        <FilterBar label="تصفية تحليل المحفظة" count={projectsReady ? `${projectCount(scoped.length)} — ${portfolioScopePhrases[scope]}` : unavailable}>
          <FilterSelect label="المحفظة" value={scope} onChange={(value) => { if (isPortfolioScope(value)) setScope(value); }} options={{ active: "النشطة", archived: "المؤرشفة", all: "الكل" }} allLabel={null} />
          <FilterSelect label="الأولوية / سنة التنفيذ" value={filters.priority} onChange={(value) => setFilters({ ...filters, priority: value, execution_year: "all" })} options={priorityYearOptions} />
          <FilterSelect label="نوع العمل" value={filters.work_type} onChange={(value) => setFilters({ ...filters, work_type: value })} options={dimensionOptions.work_type} />
          <FilterSelect label="الجهة المالكة" value={filters.executive_owner} onChange={(value) => setFilters({ ...filters, executive_owner: value })} options={dimensionOptions.executive_owner} />
          <FilterSelect label="الحالة" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={dimensionOptions.status} />
        </FilterBar>

        <section className="rm-kpis" aria-label="مؤشرات الإدارة">
          <KpiCard label="المشاريع" value={projectsReady ? scoped.length : unavailable} detail={portfolioScopePhrases[scope]} />
          <KpiCard label="مشاريع P1" value={projectsReady ? analysis.p1 : unavailable} detail={executionYearLabels[1]} />
          <KpiCard label="الحمل التخطيطي — السنة الأولى" value={projectsReady ? year1.months : unavailable} unit="مشروع-شهر" detail={projectsReady ? projectCount(year1.projects) : undefined} />
          <KpiCard label="بنود تحتاج انتباه الإدارة" value={projectsReady && attentionReady ? analysis.attention.length : unavailable} href="#management-attention" />
        </section>

        <ReadSection available={projectsReady}><section className="rm-panel" aria-labelledby="planned-load-title">
          <header><h2 id="planned-load-title">الحمل التخطيطي للمحفظة</h2><small>مجموع مدد المشاريع المسجّلة بالأشهر حسب الجهة المالكة وسنة التنفيذ. يصف الخطة فقط، ولا يمثل موارد أو FTE أو نسبة استغلال.</small></header>
          <div className="rm-table-wrap"><table className="rm-table rm-load">
            <thead><tr><th scope="col">الجهة المالكة</th>{[1, 2, 3].map((year) => <th key={year} scope="col">{executionYearLabels[year as 1 | 2 | 3]}</th>)}<th scope="col">الإجمالي</th></tr></thead>
            <tbody>{analysis.load.rows.map((row) => <tr key={row.owner}>
              <th scope="row"><bdi className="rm-nowrap">{ownerRowLabels[row.owner]}</bdi></th>
              {[...row.cells, row.total].map((cell, index) => <td key={index}>{cell.projects ? <><b><bdi>{cell.months}</bdi></b> <small>شهر · {projectCount(cell.projects)}</small></> : <span className="rm-muted">—</span>}</td>)}
            </tr>)}</tbody>
            <tfoot><tr><th scope="row">الإجمالي</th>{analysis.load.totals.map((cell, index) => <td key={index}><b><bdi>{cell.months}</bdi></b> <small>شهر · {projectCount(cell.projects)}</small></td>)}<td><b><bdi>{analysis.load.totals.reduce((sum, cell) => sum + cell.months, 0)}</bdi></b> <small>شهر · {projectCount(analysis.load.totals.reduce((sum, cell) => sum + cell.projects, 0))}</small></td></tr></tfoot>
          </table></div>
          {analysis.load.totals.some((cell) => cell.unmeasured > 0) && <p className="rm-note">{projectCount(analysis.load.totals.reduce((sum, cell) => sum + cell.unmeasured, 0))} بمدة غير مسجلة أو بوحدة يوم/أسبوع غير محتسبة في الأشهر.</p>}
          {analysis.load.unscheduled > 0 && <p className="rm-note">{projectCount(analysis.load.unscheduled)} بلا أولوية، ولا يدخل في سنوات التنفيذ.</p>}
        </section></ReadSection>

        <div className="rm-grid-2">
          <ReadSection available={projectsReady}><section className="rm-panel" aria-labelledby="work-type-title">
            <header><h2 id="work-type-title">مزيج نوع العمل</h2></header>
            <ul className="rm-bars">{analysis.workTypes.rows.map((row) => <li key={row.key}><span>{workTypeLabels[row.key]}</span><i aria-hidden="true"><b style={{ width: `${Math.round((row.count / Math.max(1, analysis.workTypes.total)) * 100)}%` }} /></i><bdi>{row.count}</bdi></li>)}
              {analysis.workTypes.unset > 0 && <li><span>غير مصنّف</span><i aria-hidden="true"><b style={{ width: `${Math.round((analysis.workTypes.unset / Math.max(1, analysis.workTypes.total)) * 100)}%` }} /></i><bdi>{analysis.workTypes.unset}</bdi></li>}
            </ul>
            {!scoped.length && <p className="rm-note">لا توجد مشاريع ضمن النطاق والفلاتر الحالية.</p>}
          </section></ReadSection>

          <ReadSection available={projectsReady}><section className="rm-panel" aria-labelledby="mapping-title">
            <header><h2 id="mapping-title">اكتمال الربط بالضوابط</h2><small>مطابقة مراجع المصدر بالضوابط، وليس تحققًا من الامتثال.</small></header>
            <ul className="rm-bars">{mappingKeys.map((key) => <li key={key} className={key}><Link href={`/roadmap?mapping=${key}${registerScope[scope]}`} title={mappingCompletenessLabels[key]}>{mappingShortLabels[key]}</Link><i aria-hidden="true"><b style={{ width: `${Math.round((analysis.mapping[key] / Math.max(1, scoped.length)) * 100)}%` }} /></i><bdi>{analysis.mapping[key]}</bdi></li>)}</ul>
            {modern && modern.controls > 0 && <p className="rm-note">عبر المتطلبات: <bdi>{modern.requirements}</bdi> متطلب · <bdi>{modern.controls}</bdi> ضابط (مصدر منفصل عن الربط المباشر).</p>}
          </section></ReadSection>
        </div>

        <ReadSection available={projectsReady}><section className="rm-panel" id="management-attention" aria-labelledby="attention-title">
          <header><h2 id="attention-title">ما يحتاج انتباه الإدارة</h2><small>قواعد قابلة للتتبع لنفس النطاق المعروض.</small></header>
          {!attentionReady ? <p className="metric-unavailable">بعض قواعد التنبيه غير متاحة؛ لا يمكن تأكيد خلو المحفظة من التنبيهات.</p>
            : analysis.attention.length ? <ul className="rm-attention">{analysis.attention.map((item) => <li key={item.key} className={item.level}><div><strong>{item.title}</strong><p>{item.detail}</p></div><bdi>{item.count}</bdi></li>)}</ul>
            : <p className="rm-note">لا توجد بنود تحتاج انتباه الإدارة وفق القواعد الحالية.</p>}
          {treatmentsReady && analysis.highTreatments > 0 && <p className="rm-note">معالجات عالية الأولوية مسجلة لمشاريع النطاق: <bdi>{analysis.highTreatments}</bdi>.</p>}
        </section></ReadSection>
      </section>
    </main>
  );
}
