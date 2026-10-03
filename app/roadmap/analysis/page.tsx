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
import "../roadmap.css";

type Project = {
  id: number;
  project_code: string;
  name_ar: string;
  planned_year: number;
  planned_quarter: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  priority: "high" | "medium" | "low";
  executive_owner: string | null;
  target_outcome: string | null;
  target_end_date: string | null;
  forecast_end_date: string | null;
  recommended_technologies: string | null;
  progress_percent: number;
};
type ControlLink = { project_id: number; control_id: number };
type Treatment = { project_id: number; priority: "high" | "medium" | "low" };

export default function PortfolioAnalysisPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [links, setLinks] = useState<ControlLink[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reads, setReads] = useState<{ projects: ReadStatus; links: ReadStatus; treatments: ReadStatus }>({ projects: "UNAVAILABLE", links: "UNAVAILABLE", treatments: "UNAVAILABLE" });
  const projectsReady = reads.projects === "COMPLETE";
  const linksReady = reads.links === "COMPLETE";
  const treatmentsReady = reads.treatments === "COMPLETE";
  const planningReady = projectsReady && linksReady;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await requireProfile();
        const [projectResult, linkResult, treatmentResult, activeControlResult] = await Promise.all([
          readStrategyRows((from, to) => supabase.from("cybersecurity_projects").select("id,project_code,name_ar,planned_year,planned_quarter,status,priority,executive_owner,target_outcome,target_end_date,forecast_end_date,recommended_technologies,progress_percent", { count: "exact" }).order("planned_year").order("planned_quarter").order("id").range(from, to), row => row.id),
          readStrategyRows((from, to) => supabase.from("cybersecurity_project_controls").select("project_id,control_id", { count: "exact" }).order("project_id").order("control_id").range(from, to), row => `${row.project_id}:${row.control_id}`),
          readStrategyRows((from, to) => supabase.from("cybersecurity_project_gap_treatments").select("id,project_id,priority", { count: "exact" }).order("id").range(from, to), row => row.id),
          readStrategyRows((from, to) => supabase.from("controls").select("id,frameworks!inner(is_active)", { count: "exact" }).eq("frameworks.is_active",true).order("id").range(from, to), row => row.id),
        ]);
        if (live) {
          setReads({ projects: projectResult.status, links: linkResult.error || activeControlResult.error ? "UNAVAILABLE" : "COMPLETE", treatments: treatmentResult.status });
          const activeIds = new Set((activeControlResult.data ?? []).map(row => row.id));
          setProjects((projectResult.data ?? []) as Project[]);
          setLinks((linkResult.data ?? []).filter(row => activeIds.has(row.control_id)) as ControlLink[]);
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

  const analysis = useMemo(() => {
    const mapped = new Map<number, number>();
    links.forEach((link) => mapped.set(link.project_id, (mapped.get(link.project_id) ?? 0) + 1));
    const rows = (planningReady ? projects : []).map((project) => {
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
      linkedControls: new Set(links.map((link) => link.control_id)).size,
      highTreatments: treatments.filter((item) => item.priority === "high").length,
      highPriority: projects.filter((project) => project.priority === "high").length,
    };
  }, [projects, links, treatments, planningReady]);

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
          <div><span>دعم قرار محفظة الأمن السيبراني · 2027–2029</span><h1>تحليل المحفظة السيبرانية</h1><p>يعرض التحليل ما يمكن احتسابه من بيانات النظام، ويصرّح بالبيانات الناقصة بدل إنتاج درجات تقديرية.</p></div>
          <Link className="roadmap-primary" href="/roadmap">استكمال بيانات المشاريع ←</Link>
        </header>
        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        <ReadNotice statuses={[reads.projects, reads.links, reads.treatments]} />

        <section className="portfolio-kpis" aria-label="مؤشرات تحليل المحفظة">
          <Kpi label="اكتمال عناصر التخطيط الخمسة الحالية" value={planningReady ? `${analysis.readiness}%` : unavailable} detail="متوسط غير مرجّح لاكتمال العناصر الخمسة" tone="teal" />
          <Kpi label="مشاريع مكتملة العناصر الخمسة" value={planningReady ? `${analysis.complete}/${projects.length}` : unavailable} detail="وفق عناصر التخطيط الخمسة الحالية فقط" tone="blue" />
          <Kpi label="ضوابط ذات ربط مباشر مسجّل" value={linksReady ? analysis.linkedControls : unavailable} detail="من سجل الربط المباشر بين المشروع والضابط" />
          <Kpi label="أولوية إدارية عالية" value={projectsReady ? analysis.highPriority : unavailable} detail="تصنيف إداري، وليس Portfolio Score" tone="amber" />
        </section>

        <aside className="portfolio-prioritization-note" aria-labelledby="prioritization-note-title">
          <header><h2 id="prioritization-note-title">دعم تحديد الأولويات</h2><span>غير متاح حاليًا</span></header>
          <p>تتوفر حاليًا بيانات الحالة والأولوية الإدارية والتقدم وبعض روابط الامتثال. يتطلب دعم تحديد الأولويات مستقبلًا بيانات معتمدة إضافية قبل تقديم توصيات أو تصنيف تحليلي للمشاريع.</p>
        </aside>

        <section className="portfolio-layout">
          <article className="portfolio-card portfolio-readiness">
            <header><div><span>تعريف المؤشر</span><h2>عناصر التخطيط المحتسبة</h2></div><small>ليس مؤشر التزام أو صحة محفظة</small></header>
            <p>تُحسب النسبة بالتساوي من المالك، النتيجة المستهدفة، تاريخ الانتهاء المستهدف، حقل المعالجة أو التقنية، ورابط مباشر مسجّل بضابط. لا يدخل الربط عبر المتطلبات في هذا المؤشر.</p>
            <p className="detail-hint">هذا وصف للعناصر الخمسة الحالية، وليس حكمًا على ملاءمة نوع العمل. غياب التقنية لا يعني عيبًا في كل مشروع، وتاريخ الانتهاء المتوقع ليس عنصرًا إضافيًا في النسبة.</p><Link className="detail-back" href="/roadmap">فتح سجل المشاريع السيبرانية ←</Link>
          </article>

          <article className="portfolio-card portfolio-decision">
            <span>الإجراء التأسيسي التالي</span>
            <ReadSection available={planningReady}>
            <h2>{analysis.incomplete.length ? "استكمال عناصر التخطيط الناقصة" : "مراجعة بيانات المشاريع المسجلة"}</h2>
            <p>{analysis.incomplete.length ? `${analysis.incomplete.length} مشروعًا يفتقد واحدًا أو أكثر من عناصر التخطيط الخمسة الحالية.` : projects.length ? "اكتملت عناصر التخطيط الخمسة الحالية؛ وهذا لا يمثل تقييمًا للقيمة أو المخاطر." : "لا توجد مشاريع ضمن النطاق المقروء."}</p>
            </ReadSection>
            <div><b>{treatmentsReady ? analysis.highTreatments : unavailable}</b><span>معالجات عالية الأولوية مسجلة للمراجعة، ولا تعني تلقائيًا قرار تمويل.</span></div>
          </article>

          <ReadSection available={planningReady}><article className="portfolio-card portfolio-data-gaps">
            <header><div><span>اكتمال عناصر التخطيط الخمسة الحالية</span><h2>العناصر غير المسجلة حسب المؤشر الحالي</h2></div><small>{analysis.incomplete.length} مشروع</small></header>
            <p className="detail-hint">للمراجعة بحسب نوع العمل، لا تمثل هذه القائمة متطلبات إلزامية. التقنية اختيارية وقد لا تنطبق على السياسة أو التقييم أو التوعية أو النشاط المستمر.</p>
            <div className="portfolio-gap-table">
              <div><span>المشروع</span><span>العناصر الناقصة</span><span>الاكتمال</span></div>
              {analysis.incomplete.map(({ project, missing, readiness }) => <article key={project.id}><div><b dir="ltr">{project.project_code}</b><strong><Link className="strategy-project-link" href={projectHref(project.id, "analysis")}>{project.name_ar}</Link></strong></div><span>{missing.map((item) => item.key === "technology" ? "المعالجة أو التقنية — اختياري بحسب نوع العمل" : item.key === "outcome" ? "النتيجة المستهدفة" : item.key === "targetDate" ? "تاريخ الانتهاء المستهدف" : item.label).join(" · ")}</span><em>{readiness}%</em></article>)}
              {!analysis.incomplete.length && <p className="portfolio-empty">{projects.length ? "عناصر التخطيط الخمسة الحالية مكتملة لجميع المشاريع المعروضة." : "لا توجد مشاريع ضمن النطاق المقروء."}</p>}
            </div>
          </article></ReadSection>
        </section>
        <PlanningInformationSummary projects={projects} status={reads.projects} />
      </section>
    </main>
  );
}

function Kpi({ label, value, detail, tone = "" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`roadmap-exec-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
