"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { projectHref } from "@/lib/strategy-navigation";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, unavailable, type ReadStatus } from "@/lib/strategy-read";
import { ReadNotice, ReadSection } from "../read-state";
import { PlanningInformationSummary } from "../planning-information";
import { planningReadiness, planningReadinessItems } from "../portfolio-metrics";
import { scopedHighTreatments } from "@/lib/portfolio-treatments";
import { dimensionOptions, dimensionText, durationBreakdown, isPortfolioScope, matchesPortfolioFilters, matchesScope, portfolioBreakdown, portfolioScopePhrases, portfolioScopes, scopedRequirementCounts, type PortfolioDimension, type PortfolioFields, type PortfolioScope } from "@/lib/portfolio-analytics";
import { projectCount } from "@/lib/arabic-count";
import { readCanonicalEdges, type CanonicalEdges } from "@/lib/strategy-portfolio-read";
import "../roadmap.css";

type Project = PortfolioFields & {
  id: number;
  project_code: string;
  name_ar: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  target_outcome: string | null;
  recommended_technologies: string | null;
  progress_percent: number;
};
const dimensions: PortfolioDimension[] = ["priority", "execution_year", "work_type", "executive_owner", "status"];
type ControlLink = { project_id: number; control_id: number };
type Treatment = { project_id: number; priority: "high" | "medium" | "low" };

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
  const planningReady = projectsReady && linksReady;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await requireProfile();
        const [projectResult, linkResult, treatmentResult, activeControlResult] = await Promise.all([
          readStrategyRows((from, to) => supabase.from("cybersecurity_projects").select("id,project_code,name_ar,status,target_outcome,recommended_technologies,progress_percent,portfolio_priority,execution_year,work_type,executive_owner_code,executive_owner_other,duration_value,duration_unit,archived_at", { count: "exact" }).order("portfolio_priority", { nullsFirst: false }).order("id").range(from, to), row => row.id),
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
  const scoped = useMemo(() => projects.filter((project) => matchesScope(project, scope) && matchesPortfolioFilters(project, filters)), [projects, scope, filters]);
  const modern = useMemo(() => scopedRequirementCounts(canonical, scoped), [canonical, scoped]);
  const durations = useMemo(() => durationBreakdown(scoped), [scoped]);
  const analysis = useMemo(() => {
    const mapped = new Map<number, number>();
    links.forEach((link) => mapped.set(link.project_id, (mapped.get(link.project_id) ?? 0) + 1));
    const scopedIds = new Set(scoped.map((project) => project.id));
    const rows = (planningReady ? scoped : []).map((project) => {
      const linked = mapped.get(project.id) ?? 0;
      return {
        project,
        linked,
        readiness: planningReadiness(project, linked),
        missing: planningReadinessItems(project, linked).filter((item) => !item.complete),
      };
    });
    const readiness = rows.length
      ? Math.round(rows.reduce((total, row) => total + row.readiness, 0) / rows.length)
      : 0;
    const incomplete = rows.filter((row) => row.readiness < 100).sort((a, b) => a.readiness - b.readiness);
    return {
      rows,
      readiness,
      incomplete,
      complete: rows.filter((row) => row.readiness === 100).length,
      linkedControls: new Set(links.filter((link) => scopedIds.has(link.project_id)).map((link) => link.control_id)).size,
      highTreatments: scopedHighTreatments(treatments, scoped).length,
      p1: scoped.filter((project) => project.portfolio_priority === "P1").length,
      breakdowns: dimensions.map((dimension) => ({ dimension, ...portfolioBreakdown(scoped, dimension) })),
    };
  }, [scoped, links, treatments, planningReady]);

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحليل محفظة المشاريع…</p></main>;
  }

  return (
    <main className="roadmap-page portfolio-analysis" dir="rtl">
      <section className="roadmap-shell">
        <nav className="roadmap-view-tabs" aria-label="إدارة محفظة الأمن السيبراني">
          <Link href="/roadmap">سجل المشاريع السيبرانية</Link>
          <Link className="active" href="/roadmap/analysis">تحليل المحفظة السيبرانية</Link>
          <Link href="/roadmap/dashboard">خارطة طريق المشاريع</Link>
        </nav>

        <header className="portfolio-hero">
          <div><span>دعم قرار محفظة الأمن السيبراني · الأولوية وسنة التنفيذ</span><h1>تحليل المحفظة السيبرانية</h1><p>يعرض التحليل ما يمكن احتسابه من بيانات النظام، ويصرّح بالبيانات الناقصة بدل إنتاج درجات تقديرية.</p></div>
          <Link className="roadmap-primary" href="/roadmap">استكمال بيانات المشاريع ←</Link>
        </header>
        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        <ReadNotice statuses={[reads.projects, reads.links, reads.treatments, modern ? "COMPLETE" : "UNAVAILABLE"]} />

        <section className="register-toolbar" aria-label="تصفية تحليل المحفظة">
          <label><span>المحفظة</span><select value={scope} onChange={(event) => { if (isPortfolioScope(event.target.value)) setScope(event.target.value); }}>{Object.entries(portfolioScopes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {dimensions.map((dimension) => <label key={dimension}><span>{dimensionText[dimension]}</span><select value={filters[dimension]} onChange={(event) => setFilters({ ...filters, [dimension]: event.target.value })}><option value="all">الكل</option>{Object.entries(dimensionOptions[dimension]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
          <strong>{projectsReady ? `${projectCount(scoped.length)} — ${portfolioScopePhrases[scope]}` : unavailable}</strong>
        </section>

        <section className="portfolio-kpis" aria-label="مؤشرات تحليل المحفظة">
          <Kpi label="اكتمال عناصر التخطيط الخمسة الحالية" value={planningReady ? `${analysis.readiness}%` : unavailable} detail="متوسط غير مرجّح لاكتمال العناصر الخمسة" tone="teal" />
          <Kpi label="مشاريع مكتملة العناصر الخمسة" value={planningReady ? `${analysis.complete}/${scoped.length}` : unavailable} detail="وفق عناصر التخطيط الخمسة الحالية فقط" tone="blue" />
          <Kpi label="ضوابط ذات ربط مباشر مسجّل" value={linksReady ? analysis.linkedControls : unavailable} detail="من سجل الربط المباشر بين المشروع والضابط" />
          <Kpi label="ضوابط مميزة عبر المتطلبات" value={modern?.controls ?? unavailable} detail="لمشاريع النطاق والفلاتر المعروضة فقط؛ منفصلة عن الربط المباشر ولا تثبت الامتثال" />
          <Kpi label="مشاريع الأولوية P1" value={projectsReady ? analysis.p1 : unavailable} detail="السنة الأولى؛ تصنيف معتمد وليس Portfolio Score" tone="amber" />
        </section>

        <ReadSection available={projectsReady}><section className="portfolio-card" aria-labelledby="portfolio-breakdown-title">
          <header><div><span>توزيع {portfolioScopePhrases[scope]}</span><h2 id="portfolio-breakdown-title">التحليل حسب الأولوية وسنة التنفيذ ونوع العمل والمالك والحالة</h2></div></header>
          <div className="portfolio-breakdown">
            {analysis.breakdowns.map(({ dimension, rows, unset }) => <table key={dimension} aria-label={dimensionText[dimension]}>
              <thead><tr><th>{dimensionText[dimension]}</th><th>المشاريع</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.value}><td>{row.label}</td><td>{row.count}</td></tr>)}{unset > 0 && <tr><td>غير مصنّف</td><td>{unset}</td></tr>}</tbody>
            </table>)}
          </div>
        </section></ReadSection>

        <ReadSection available={projectsReady}><section className="portfolio-card portfolio-duration" aria-labelledby="portfolio-duration-title">
          <header><div><span>مدة المشاريع المسجّلة</span><h2 id="portfolio-duration-title">تحليل مدة المشاريع</h2></div><small>بالوحدة المسجّلة لكل مشروع؛ لا تحويل بين الوحدات</small></header>
          {!durations.groups.length ? <p className="portfolio-empty">{scoped.length ? "لا توجد مدد مسجّلة للمشاريع المعروضة." : "لا توجد مشاريع ضمن النطاق والفلاتر الحالية."}</p> : <div className="portfolio-breakdown">
            {durations.groups.map((group) => <table key={group.unit} aria-label={`مدة المشاريع بال${group.label}`}>
              <caption>{group.label}: {projectCount(group.count)} · الأدنى <bdi>{group.min}</bdi> · الوسيط <bdi>{group.median}</bdi> · الأعلى <bdi>{group.max}</bdi></caption>
              <thead><tr><th>المدة</th><th>المشاريع</th></tr></thead>
              <tbody>{group.values.map((row) => <tr key={row.value}><td><bdi>{row.label}</bdi></td><td>{row.count}</td></tr>)}</tbody>
            </table>)}
          </div>}
          {durations.unset > 0 && <p className="detail-hint">{projectCount(durations.unset)} بلا مدة مسجّلة (غير مصنّفة).</p>}
        </section></ReadSection>

        <aside className="portfolio-prioritization-note" aria-labelledby="prioritization-note-title">
          <header><h2 id="prioritization-note-title">دعم تحديد الأولويات</h2><span>غير متاح حاليًا</span></header>
          <p>تتوفر حاليًا بيانات الحالة والأولوية والتقدم وبعض روابط الامتثال. يتطلب دعم تحديد الأولويات مستقبلًا بيانات معتمدة إضافية قبل تقديم توصيات أو تصنيف تحليلي للمشاريع.</p>
        </aside>

        <section className="portfolio-layout">
          <article className="portfolio-card portfolio-readiness">
            <header><div><span>تعريف المؤشر</span><h2>عناصر التخطيط المحتسبة</h2></div><small>ليس مؤشر التزام أو صحة محفظة</small></header>
            <p>تُحسب النسبة بالتساوي من الأولوية، المالك التنفيذي، مدة المشروع، النتيجة المستهدفة، ورابط مباشر مسجّل بضابط. لا يدخل الربط عبر المتطلبات في هذا المؤشر.</p>
            <p className="detail-hint">هذا وصف للعناصر الخمسة الحالية، وليس حكمًا على ملاءمة نوع العمل. لم تعد تواريخ المشروع عناصر في النسبة؛ سنة التنفيذ مشتقة من الأولوية.</p><Link className="detail-back" href="/roadmap">فتح سجل المشاريع السيبرانية ←</Link>
          </article>

          <article className="portfolio-card portfolio-decision">
            <span>الإجراء التأسيسي التالي</span>
            <ReadSection available={planningReady}>
            <h2>{analysis.incomplete.length ? "استكمال عناصر التخطيط الناقصة" : "مراجعة بيانات المشاريع المسجلة"}</h2>
            <p>{analysis.incomplete.length ? `${projectCount(analysis.incomplete.length)} يفتقد واحدًا أو أكثر من عناصر التخطيط الخمسة الحالية.` : scoped.length ? "اكتملت عناصر التخطيط الخمسة الحالية؛ وهذا لا يمثل تقييمًا للقيمة أو المخاطر." : "لا توجد مشاريع ضمن النطاق المقروء."}</p>
            </ReadSection>
            <div><b>{treatmentsReady ? analysis.highTreatments : unavailable}</b><span>معالجات عالية الأولوية مسجلة للمراجعة، ولا تعني تلقائيًا قرار تمويل.</span></div>
          </article>

          <ReadSection available={planningReady}><article className="portfolio-card portfolio-data-gaps">
            <header><div><span>اكتمال عناصر التخطيط الخمسة الحالية</span><h2>العناصر غير المسجلة حسب المؤشر الحالي</h2></div><small>{projectCount(analysis.incomplete.length)}</small></header>
            <p className="detail-hint">للمراجعة بحسب نوع العمل. المشاريع المسجلة بالنموذج السابق تظهر هنا حتى تُستكمل أولويتها ومالكها ومدتها يدويًا.</p>
            <div className="portfolio-gap-table">
              <div><span>المشروع</span><span>العناصر الناقصة</span><span>الاكتمال</span></div>
              {analysis.incomplete.map(({ project, missing, readiness }) => <article key={project.id}><div><b dir="ltr">{project.project_code}</b><strong><Link className="strategy-project-link" href={projectHref(project.id, "analysis")}>{project.name_ar}</Link></strong></div><span>{missing.map((item) => item.key === "outcome" ? "النتيجة المستهدفة" : item.label).join(" · ")}</span><em>{readiness}%</em></article>)}
              {!analysis.incomplete.length && <p className="portfolio-empty">{scoped.length ? "عناصر التخطيط الخمسة الحالية مكتملة لجميع المشاريع المعروضة." : "لا توجد مشاريع ضمن النطاق المقروء."}</p>}
            </div>
          </article></ReadSection>
        </section>
        <PlanningInformationSummary projects={scoped} status={reads.projects} />
      </section>
    </main>
  );
}

function Kpi({ label, value, detail, tone = "" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`roadmap-exec-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
