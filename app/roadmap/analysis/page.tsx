"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
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

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await requireProfile();
        const [projectResult, linkResult, treatmentResult, activeControlResult] = await Promise.all([
          supabase.from("cybersecurity_projects").select("id,project_code,name_ar,planned_year,planned_quarter,status,priority,executive_owner,target_outcome,target_end_date,recommended_technologies,progress_percent").order("planned_year").order("planned_quarter"),
          supabase.from("cybersecurity_project_controls").select("project_id,control_id"),
          supabase.from("cybersecurity_project_gap_treatments").select("project_id,priority"),
          supabase.from("controls").select("id,frameworks!inner(is_active)").eq("frameworks.is_active",true),
        ]);
        if (projectResult.error) throw projectResult.error;
        if (linkResult.error) throw linkResult.error;
        if (treatmentResult.error) throw treatmentResult.error;
        if (activeControlResult.error) throw activeControlResult.error;
        if (live) {
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
        setError(detail);
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
    const rows = projects.map((project) => {
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
  }, [projects, links, treatments]);

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحليل محفظة المشاريع…</p></main>;
  }

  return (
    <main className="roadmap-page portfolio-analysis" dir="rtl">
      <section className="roadmap-shell">
        <nav className="roadmap-view-tabs" aria-label="إدارة محفظة الأمن السيبراني">
          <Link href="/roadmap">سجل المشاريع</Link>
          <Link className="active" href="/roadmap/analysis">تحليل المحفظة</Link>
          <Link href="/roadmap/dashboard">خارطة الطريق</Link>
        </nav>

        <header className="portfolio-hero">
          <div><span>دعم قرار محفظة الأمن السيبراني · 2027–2029</span><h1>الأولوية والقيمة والمخاطر</h1><p>يعرض التحليل ما يمكن احتسابه من بيانات النظام، ويصرّح بالبيانات الناقصة بدل إنتاج درجات تقديرية.</p></div>
          <Link className="roadmap-primary" href="/roadmap">استكمال بيانات المشاريع ←</Link>
        </header>
        {error && <p className="roadmap-alert" role="alert">{error}</p>}

        <section className="portfolio-kpis" aria-label="مؤشرات تحليل المحفظة">
          <Kpi label="اكتمال بيانات التخطيط" value={`${analysis.readiness}%`} detail="5 حقول موثقة لكل مشروع" tone="teal" />
          <Kpi label="مشاريع مكتملة البيانات" value={`${analysis.complete}/${projects.length}`} detail="اكتمال جميع حقول خط الأساس" tone="blue" />
          <Kpi label="ضوابط مرتبطة بمشروع معالجة" value={analysis.linkedControls} detail="روابط فعلية في سجل العلاقات" />
          <Kpi label="أولوية إدارية عالية" value={analysis.highPriority} detail="تصنيف إداري، وليس Portfolio Score" tone="amber" />
        </section>

        <section className="portfolio-layout">
          <article className="portfolio-card portfolio-decision-readiness">
            <header><div><span>جاهزية دعم القرار</span><h2>Portfolio Prioritization غير مفعّل بعد</h2></div><small>لا توجد درجة مصطنعة</small></header>
            <p>المنصة لا تملك حاليًا مدخلات موثقة للقيمة الاستراتيجية، خفض المخاطر، الإلزام التنظيمي، الأثر، الجهد، التعقيد ومخاطر التسليم. لذلك لا يمكن تصنيف المشاريع بأمان إلى Must Do أو Quick Wins أو Defer.</p>
            <div className="decision-data-grid">
              <section><strong>متاح الآن</strong><span>الأولوية الإدارية</span><span>الحالة والتقدم</span><span>المالك والناتج</span><span>معالجات الفجوات</span></section>
              <section><strong>مطلوب للحساب</strong><span>Strategic Alignment</span><span>Risk Reduction</span><span>Compliance Criticality</span><span>Effort / Complexity</span></section>
            </div>
          </article>

          <article className="portfolio-card portfolio-readiness">
            <header><div><span>جودة خط الأساس</span><h2>اكتمال بيانات التخطيط</h2></div><small>ليس مؤشر التزام أو صحة محفظة</small></header>
            <div className="portfolio-score"><div style={{ "--score": `${analysis.readiness * 3.6}deg` } as React.CSSProperties}><b>{analysis.readiness}%</b><span>اكتمال</span></div><aside><strong>{analysis.incomplete.length ? "التحليل ينتظر استكمال البيانات" : "خط الأساس مكتمل"}</strong><p>تُحسب النسبة بالتساوي من المالك، الناتج، التاريخ المستهدف، المعالجة أو التقنية، ورابط ضابط فعلي.</p><Link href="/roadmap">فتح سجل المشاريع ←</Link></aside></div>
          </article>

          <article className="portfolio-card portfolio-decision">
            <span>الإجراء التأسيسي التالي</span>
            <h2>{analysis.incomplete.length ? "استكمال خط الأساس قبل ترتيب الاستثمار" : "اعتماد نموذج تقييم المحفظة"}</h2>
            <p>{analysis.incomplete.length ? `${analysis.incomplete.length} مشروعًا يفتقد واحدًا أو أكثر من الحقول الخمسة. لن تظهر درجات أولوية قبل اكتمال مصدرها.` : "اكتملت بيانات التخطيط ويمكن الانتقال إلى اعتماد أوزان القيمة والجدوى."}</p>
            <div><b>{analysis.highTreatments}</b><span>معالجات عالية الأولوية مسجلة للمراجعة، ولا تعني تلقائيًا قرار تمويل.</span></div>
          </article>

          <article className="portfolio-card portfolio-data-gaps">
            <header><div><span>جودة البيانات</span><h2>المشاريع التي تحتاج استكمالًا</h2></div><small>{analysis.incomplete.length} مشروع</small></header>
            <div className="portfolio-gap-table">
              <div><span>المشروع</span><span>الحقول الناقصة</span><span>الاكتمال</span></div>
              {analysis.incomplete.map(({ project, missing, readiness }) => <article key={project.id}><div><b dir="ltr">{project.project_code}</b><strong>{project.name_ar}</strong></div><span>{missing.map((item) => item.label).join(" · ")}</span><em>{readiness}%</em></article>)}
              {!analysis.incomplete.length && <p className="portfolio-empty">بيانات جميع المشاريع مكتملة وفق الحد الأدنى الحالي.</p>}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

function Kpi({ label, value, detail, tone = "" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`roadmap-exec-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
