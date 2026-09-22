"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { averageProgress, getRiyadhDate, isDelayed, scheduleMetric } from "../portfolio-metrics";
import "../roadmap.css";

type Project = {
  id: number;
  project_code: string;
  name_ar: string;
  planned_year: number;
  planned_quarter: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  priority: "high" | "medium" | "low";
  progress_percent: number;
  executive_owner: string | null;
  target_outcome: string | null;
  recommended_technologies: string | null;
  planned_start_date: string | null;
  target_end_date: string | null;
  forecast_end_date: string | null;
};
type LinkRow = { project_id: number; control_id: number };

const statusText = { planned: "مخطط", in_progress: "قيد التنفيذ", on_hold: "متوقف", completed: "مكتمل" };
const priorityText = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const quarters = ["Q1", "Q2", "Q3", "Q4"];

export default function RoadmapDashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await requireProfile();
        const [projectResult, linkResult, activeControlResult] = await Promise.all([
          supabase.from("cybersecurity_projects").select("id,project_code,name_ar,planned_year,planned_quarter,status,priority,progress_percent,executive_owner,target_outcome,recommended_technologies,planned_start_date,target_end_date,forecast_end_date").order("planned_year").order("planned_quarter").order("project_code"),
          supabase.from("cybersecurity_project_controls").select("project_id,control_id"),
          supabase.from("controls").select("id,frameworks!inner(is_active)").eq("frameworks.is_active",true),
        ]);
        if (projectResult.error) throw projectResult.error;
        if (linkResult.error) throw linkResult.error;
        if (activeControlResult.error) throw activeControlResult.error;
        if (live) {
          const activeIds = new Set((activeControlResult.data ?? []).map(row => row.id));
          setProjects((projectResult.data ?? []) as Project[]);
          setLinks((linkResult.data ?? []).filter(row => activeIds.has(row.control_id)) as LinkRow[]);
        }
      } catch (cause) {
        if (!live) return;
        const detail = cause instanceof Error ? cause.message : "تعذر تحميل خارطة الطريق.";
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

  const data = useMemo(() => {
    const schedule = scheduleMetric(projects);
    return {
      average: averageProgress(projects),
      active: projects.filter((project) => project.status === "in_progress").length,
      complete: projects.filter((project) => project.status === "completed").length,
      controls: new Set(links.map((link) => link.control_id)).size,
      schedule,
      delayed: projects.filter((project) => isDelayed(project)).sort((a, b) => String(a.target_end_date).localeCompare(String(b.target_end_date))),
      missingDates: projects.filter((project) => !project.target_end_date),
    };
  }, [projects, links]);

  const exportExcel = () => {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["رمز المشروع", "المشروع", "السنة", "الربع", "الحالة", "الأولوية", "نسبة الإنجاز", "المالك", "بداية الخطة", "التاريخ المستهدف", "التاريخ المتوقع", "الضوابط المرتبطة"],
      ...projects.map((project) => [project.project_code, project.name_ar, project.planned_year, project.planned_quarter, statusText[project.status], priorityText[project.priority], `${project.progress_percent}%`, project.executive_owner, project.planned_start_date, project.target_end_date, project.forecast_end_date, links.filter((link) => link.project_id === project.id).length]),
    ];
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "خارطة-الطريق-السيبرانية-2027-2029.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحميل خارطة الطريق…</p></main>;
  }

  return (
    <main className="roadmap-page roadmap-executive" dir="rtl">
      <section className="roadmap-shell">
        <nav className="roadmap-view-tabs" aria-label="إدارة محفظة الأمن السيبراني">
          <Link href="/roadmap">سجل المشاريع</Link>
          <Link href="/roadmap/analysis">تحليل المحفظة</Link>
          <Link className="active" href="/roadmap/dashboard">خارطة الطريق</Link>
        </nav>

        <header className="roadmap-exec-hero">
          <div><span>خطة التنفيذ · 2027–2029</span><h1>خارطة طريق الأمن السيبراني</h1><p>متى تبدأ المبادرات، وما تسلسلها، وأين توجد استثناءات الجدول الزمني.</p></div>
          <div className="roadmap-export-actions"><button type="button" onClick={() => window.print()}>تصدير PDF</button><button type="button" onClick={exportExcel}>تصدير Excel</button><Link href="/roadmap/executive" className="roadmap-primary">عرض الإدارة العليا ←</Link><Link href="/roadmap" className="roadmap-secondary">تحديث المشاريع</Link></div>
        </header>
        {error && <p className="roadmap-alert" role="alert">{error}</p>}

        <section className="roadmap-exec-kpis roadmap-snapshot" aria-label="ملخص خارطة الطريق">
          <Kpi label="المشاريع" value={projects.length} detail={`${data.active} قيد التنفيذ · ${data.complete} مكتمل`} />
          <Kpi label="تقدم الخطة" value={`${data.average}%`} detail="متوسط غير مرجح من المشاريع" tone="teal" />
          <Kpi label="المشاريع المتأخرة" value={data.schedule.value ?? "غير متاح"} detail={data.schedule.value === null ? "أدخل التواريخ المستهدفة أولًا" : `حتى ${getRiyadhDate()}`} tone="amber" />
          <Kpi label="بلا تاريخ مستهدف" value={data.schedule.missingDates} detail="لا تدخل في حساب التأخير" tone="amber" />
          <Kpi label="ضوابط مرتبطة بمشروع معالجة" value={data.controls} detail="لا تعني تحقق الالتزام" tone="blue" />
        </section>

        <section className="quarterly-roadmap" aria-labelledby="quarterly-roadmap-title">
          <header><div><span>العرض التشغيلي</span><h2 id="quarterly-roadmap-title">التسلسل الربعي للمبادرات</h2><p>اللون يوضح حالة التنفيذ، والشارة توضح الأولوية الإدارية.</p></div><small>As of {getRiyadhDate()}</small></header>
          <div className="quarterly-roadmap-grid">
            <div className="quarterly-head"><span>السنة</span>{quarters.map((quarter) => <b key={quarter}>{quarter}</b>)}</div>
            {[2027, 2028, 2029].map((year) => <div className="quarterly-row" key={year}><b>{year}</b>{quarters.map((quarter) => <section key={quarter}>{projects.filter((project) => project.planned_year === year && project.planned_quarter === quarter).map((project) => <Link href="/roadmap" key={project.id} className={`quarterly-project ${project.status}`} title={`${project.project_code} — ${project.name_ar}`}><div><b dir="ltr">{project.project_code}</b><span className={`register-priority ${project.priority}`}>{priorityText[project.priority]}</span></div><strong>{project.name_ar}</strong><small>{project.executive_owner || "مالك غير محدد"} · {project.progress_percent}%</small></Link>)}</section>)}</div>)}
          </div>
        </section>

        <section className="roadmap-exceptions">
          <article><header><div><span>استثناءات الجدول</span><h2>المشاريع المتأخرة</h2></div><b>{data.delayed.length}</b></header>{data.schedule.value === null ? <p className="metric-unavailable">لا يمكن تحديد التأخير قبل إدخال التواريخ المستهدفة.</p> : data.delayed.length ? <ul>{data.delayed.map((project) => <li key={project.id}><b dir="ltr">{project.project_code}</b><span>{project.name_ar}</span><small>{project.target_end_date}</small></li>)}</ul> : <p>لا توجد مشاريع متأخرة حسب التواريخ المسجلة.</p>}</article>
          <article><header><div><span>جودة الخطة</span><h2>تواريخ تحتاج استكمالًا</h2></div><b>{data.missingDates.length}</b></header>{data.missingDates.length ? <ul>{data.missingDates.slice(0, 6).map((project) => <li key={project.id}><b dir="ltr">{project.project_code}</b><span>{project.name_ar}</span><Link href="/roadmap">استكمال ←</Link></li>)}</ul> : <p>جميع المشاريع تحتوي على تاريخ مستهدف.</p>}</article>
          <article><header><div><span>القدرة التحليلية</span><h2>At Risk والاعتماديات</h2></div><b>—</b></header><p className="metric-unavailable">غير متاح حتى يُفعّل سجل مخاطر التسليم واعتماديات المشاريع. لن تعرض المنصة رقمًا تقديريًا.</p></article>
        </section>
      </section>
    </main>
  );
}

function Kpi({ label, value, detail, tone = "" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`roadmap-exec-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
